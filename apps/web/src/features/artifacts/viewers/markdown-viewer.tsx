import { useQuery } from '@tanstack/react-query';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchContentText } from '../artifacts-api.ts';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';

/** Links leave the app in a new tab, without telling the target where they came from. */
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/**
 * Renders Markdown as React elements. Raw HTML in the source is shown as text, never parsed
 * (no `rehype-raw`), and react-markdown's default URL filter drops `javascript:` and similar
 * links, so the content can't inject markup or scripts into the app. Loaded lazily (default
 * export for `React.lazy`), like the PDF viewer.
 */
export default function MarkdownViewer({ contentPath }: { contentPath: string }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['content', contentPath, 'text'],
    queryFn: ({ signal }) => fetchContentText(contentPath, signal),
    // A version's content never changes.
    staleTime: Infinity,
  });

  if (error) return <InlineError error={error} onRetry={() => void refetch()} />;
  if (data === undefined) return <InlineLoading />;
  return (
    <div className="size-full overflow-auto bg-background">
      <article className="prose prose-neutral mx-auto max-w-3xl px-6 py-8 dark:prose-invert">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {data}
        </Markdown>
      </article>
    </div>
  );
}
