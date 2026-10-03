import type { Artifact } from '@artifact-hub/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, TextAreaField, TextField } from '@/components/form-fields.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { applyServerError } from '@/lib/forms/apply-server-error.ts';
import type { MetadataFormOutput, MetadataFormValues } from './artifacts.types.ts';
import { DeleteArtifactDialog } from './delete-artifact-dialog.tsx';
import { metadataFormSchema } from './metadata-form-schema.ts';
import { useUpdateArtifact } from './use-artifacts.ts';
import { VisibilityField } from './visibility-field.tsx';

/** The Details tab: description, tags and dates; the owner can edit them or delete the artifact. */
export function ArtifactDetails({ artifact, canEdit }: { artifact: Artifact; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <DetailsForm artifact={artifact} onDone={() => setEditing(false)} />;
  }
  return (
    <div className="grid gap-4 text-sm">
      {artifact.description ? (
        <p className="break-words whitespace-pre-line">{artifact.description}</p>
      ) : (
        <p className="text-muted-foreground">No description.</p>
      )}
      {artifact.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {artifact.tags.map((tag) => (
            <li key={tag}>
              <Badge variant="outline">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Created</dt>
        <dd className="text-foreground">{new Date(artifact.createdAt).toLocaleString()}</dd>
      </dl>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon aria-hidden="true" />
            Edit details
          </Button>
          <DeleteArtifactDialog artifact={artifact}>
            <Button variant="outline" size="sm" className="text-destructive">
              <Trash2Icon aria-hidden="true" />
              Delete
            </Button>
          </DeleteArtifactDialog>
        </div>
      ) : null}
    </div>
  );
}

/** Edits the title, description, tags and visibility. Saving never creates a version. */
function DetailsForm({ artifact, onDone }: { artifact: Artifact; onDone: () => void }) {
  const update = useUpdateArtifact(artifact.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MetadataFormValues, unknown, MetadataFormOutput>({
    resolver: zodResolver(metadataFormSchema),
    defaultValues: {
      title: artifact.title,
      description: artifact.description,
      tags: artifact.tags.join(', '),
      visibility: artifact.visibility,
    },
  });

  const submit = handleSubmit(async (changes) => {
    try {
      await update.mutateAsync(changes);
      toast.success('Details saved');
      onDone();
    } catch (error) {
      applyServerError(error, setError, ['title', 'description', 'tags', 'visibility']);
    }
  });

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <FormError message={errors.root?.server?.message} />
      <TextField label="Title" error={errors.title?.message} {...register('title')} />
      <TextAreaField
        label="Description"
        rows={4}
        error={errors.description?.message}
        {...register('description')}
      />
      <TextField
        label="Tags"
        hint="Separate tags with commas"
        error={errors.tags?.message}
        {...register('tags')}
      />
      <VisibilityField disabled={isSubmitting} {...register('visibility')} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
