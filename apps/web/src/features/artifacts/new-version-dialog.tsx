import {
  type Artifact,
  type CreateVersionMetadata,
  type CreateVersionRequest,
  createVersionRequestSchema,
} from '@artifact-hub/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, TextAreaField } from '@/components/form-fields.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';
import { useAppConfig } from '@/features/config/use-app-config.ts';
import { isApiError } from '@/lib/api/api-error.ts';
import { applyServerError } from '@/lib/forms/apply-server-error.ts';
import { fileProblem } from './file-checks.ts';
import { FileDropZone } from './file-drop-zone.tsx';
import { usePublishVersion } from './use-artifacts.ts';

/**
 * Uploads new content for `artifact` as its next version, from `children` (the trigger).
 * `onPublished` runs with the updated artifact once the dialog has closed.
 */
export function NewVersionDialog({
  artifact,
  onPublished,
  children,
}: {
  artifact: Artifact;
  onPublished: (artifact: Artifact) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const publish = usePublishVersion(artifact.id);

  const onOpenChange = (next: boolean) => {
    // Keep the dialog open while the upload is in flight.
    if (publish.isPending) return;
    if (next) publish.reset();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a new version</DialogTitle>
          <DialogDescription>
            It becomes v{artifact.latestVersionNo + 1} of “{artifact.title}”. Earlier versions stay
            available.
          </DialogDescription>
        </DialogHeader>
        <NewVersionForm
          onSubmit={(file, changeNote) => publish.mutateAsync({ file, metadata: { changeNote } })}
          onPublished={(updated) => {
            setOpen(false);
            toast.success(`Published v${updated.latestVersionNo}`);
            onPublished(updated);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewVersionForm({
  onSubmit,
  onPublished,
}: {
  onSubmit: (file: File, changeNote: string) => Promise<Artifact>;
  onPublished: (artifact: Artifact) => void;
}) {
  const { data: config } = useAppConfig();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateVersionRequest, unknown, CreateVersionMetadata>({
    resolver: zodResolver(createVersionRequestSchema),
    defaultValues: { changeNote: '' },
  });

  const chooseFile = (chosen: File) => {
    const problem = fileProblem(chosen, config?.maxArtifactBytes);
    setFileError(problem);
    if (!problem) setFile(chosen);
  };

  const submit = handleSubmit(async ({ changeNote }) => {
    if (!file) return;
    try {
      onPublished(await onSubmit(file, changeNote));
    } catch (error) {
      if (isApiError(error, 'UNSUPPORTED_TYPE') || isApiError(error, 'ARTIFACT_TOO_LARGE')) {
        setFileError(error.message);
        return;
      }
      applyServerError(error, setError, ['changeNote']);
    }
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        // Report a missing file together with any field errors.
        if (!file) setFileError('Choose a file to upload.');
        void submit(event);
      }}
    >
      <FormError message={errors.root?.server?.message} />
      <FileDropZone
        file={file}
        onFileChange={chooseFile}
        maxBytes={config?.maxArtifactBytes}
        error={fileError}
        disabled={isSubmitting}
      />
      <TextAreaField
        label="What changed?"
        hint="Optional"
        rows={3}
        error={errors.changeNote?.message}
        {...register('changeNote')}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Uploading…' : 'Upload version'}
        </Button>
      </DialogFooter>
    </form>
  );
}
