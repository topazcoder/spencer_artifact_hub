import { toast } from 'sonner';

/** Copies `text` and says so, or asks the user to copy it themselves. */
export async function copyWithToast(text: string, what = 'Link'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Couldn't copy the ${what.toLowerCase()}. Select it and copy it yourself.`);
  }
}
