import {
  ARTIFACT_SEARCH_MAX_LENGTH,
  type ArtifactListScope,
  type SearchFilters,
} from '@artifact-hub/shared';
import { SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError, TextField } from '@/components/form-fields.tsx';
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
import { describeError } from '@/lib/api/api-error.ts';
import { useInterpretSearch } from './use-artifacts.ts';

/**
 * Searching by describing what you want ("the pricing deck Sara shared last week"): AI turns
 * it into the gallery's filters, applied through `onSearch` once the dialog has closed. If AI
 * can't read it, the words are searched as they are.
 */
export function AiSearchDialog({
  scope,
  onSearch,
}: {
  /** The gallery tab it was opened from. */
  scope: ArtifactListScope;
  onSearch: (filters: SearchFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const interpret = useInterpretSearch();

  const onOpenChange = (next: boolean) => {
    // Keep the dialog open while the search is being read.
    if (interpret.isPending) return;
    if (next) {
      setText('');
      interpret.reset();
    }
    setOpen(next);
  };

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    interpret.mutate(
      { q, scope },
      {
        onSuccess: ({ interpreted, filters }) => {
          setOpen(false);
          if (!interpreted)
            toast.info("AI couldn't help right now, so we searched for your words.");
          onSearch(filters);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SparklesIcon aria-hidden="true" />
          AI search
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Search with AI</DialogTitle>
          <DialogDescription>
            Describe what you're looking for: who made it, what it's about, what kind of file, when.
            It's turned into filters you can change afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormError message={interpret.error ? describeError(interpret.error) : undefined} />
          <TextField
            label="What are you looking for?"
            placeholder="e.g. the pricing deck Sara shared last week"
            maxLength={ARTIFACT_SEARCH_MAX_LENGTH}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={interpret.isPending}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={interpret.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={interpret.isPending || !text.trim()}>
              {interpret.isPending ? 'Searching…' : 'Search'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
