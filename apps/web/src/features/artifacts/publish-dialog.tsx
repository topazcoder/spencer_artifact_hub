import { type Artifact, formatBytes } from '@artifact-hub/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FormError, TextAreaField, TextField } from '@/components/form-fields.tsx';
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
import { titleFromFilename } from './artifact-types.ts';
import type { PublishFormOutput, PublishFormValues } from './artifacts.types.ts';
import { FileDropZone } from './file-drop-zone.tsx';
import { publishFormSchema } from './publish-form-schema.ts';
import { usePublishArtifact } from './use-artifacts.ts';

/** Opens the publish dialog from `children` (the trigger button). */
export function PublishDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const publish = usePublishArtifact();
  const navigate = useNavigate();

  const onOpenChange = (next: boolean) => {
    // Keep the dialog open while the upload is in flight.
    if (publish.isPending) return;
    if (next) publish.reset();
    setOpen(next);
  };

  const onPublished = (artifact: Artifact) => {
    setOpen(false);
    toast.success(`Published “${artifact.title}”`);
    void navigate(`/artifacts/${artifact.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish an artifact</DialogTitle>
          <DialogDescription>
            Only you can see it until you share it or make it public.
          </DialogDescription>
        </DialogHeader>
        <PublishForm
          onSubmit={(file, metadata) => publish.mutateAsync({ file, metadata })}
          onPublished={onPublished}
        />
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({
  onSubmit,
  onPublished,
}: {
  onSubmit: (file: File, metadata: PublishFormOutput) => Promise<Artifact>;
  onPublished: (artifact: Artifact) => void;
}) {
  const { data: config } = useAppConfig();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<PublishFormValues, unknown, PublishFormOutput>({
    resolver: zodResolver(publishFormSchema),
    defaultValues: { title: '', description: '', tags: '' },
  });

  const chooseFile = (chosen: File) => {
    const maxBytes = config?.maxArtifactBytes;
    if (chosen.size === 0) {
      setFileError('This file is empty.');
      return;
    }
    if (maxBytes && chosen.size > maxBytes) {
      setFileError(
        `This file is ${formatBytes(chosen.size)}. The limit is ${formatBytes(maxBytes)}.`,
      );
      return;
    }
    setFile(chosen);
    setFileError(undefined);
    // Default the title to the file name, unless the user already typed one.
    if (!getFieldState('title').isDirty) {
      setValue('title', titleFromFilename(chosen.name), { shouldValidate: !!errors.title });
    }
  };

  const submit = handleSubmit(async (metadata) => {
    if (!file) return;
    try {
      onPublished(await onSubmit(file, metadata));
    } catch (error) {
      if (isApiError(error, 'UNSUPPORTED_TYPE') || isApiError(error, 'ARTIFACT_TOO_LARGE')) {
        setFileError(error.message);
        return;
      }
      applyServerError(error, setError, ['title', 'description', 'tags']);
    }
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        // Report a missing file together with any field errors.
        if (!file) setFileError('Choose a file to publish.');
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
      <TextField label="Title" error={errors.title?.message} {...register('title')} />
      <TextAreaField
        label="Description"
        rows={3}
        error={errors.description?.message}
        {...register('description')}
      />
      <TextField
        label="Tags"
        hint="Separate tags with commas, e.g. marketing, q3"
        error={errors.tags?.message}
        {...register('tags')}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Publishing…' : 'Publish'}
        </Button>
      </DialogFooter>
    </form>
  );
}
