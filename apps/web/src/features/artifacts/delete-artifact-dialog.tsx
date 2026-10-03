import type { Artifact } from '@artifact-hub/shared';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';
import { buttonVariants } from '@/components/ui/button.tsx';
import { describeError } from '@/lib/api/api-error.ts';
import { useDeleteArtifact } from './use-artifacts.ts';

/** Asks before deleting `artifact`, then goes home. Opened from `children` (the trigger). */
export function DeleteArtifactDialog({
  artifact,
  children,
}: {
  artifact: Artifact;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const remove = useDeleteArtifact(artifact.id, () => navigate('/', { replace: true }));

  const confirm = () =>
    remove.mutate(undefined, {
      onSuccess: () => toast.success(`Deleted “${artifact.title}”`),
      onError: (error) => toast.error(describeError(error)),
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{artifact.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            All its versions are removed for everyone it was shared with, and its links stop
            working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={remove.isPending}
            onClick={confirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
