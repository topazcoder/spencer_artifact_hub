/**
 * HTML runs in a sandboxed iframe. Without `allow-same-origin` it gets an opaque origin, so its
 * scripts can't reach the app's cookies, storage or API. The server's CSP sandboxes it too,
 * even when the content URL is opened directly.
 */
export function HtmlViewer({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      sandbox="allow-scripts allow-popups"
      referrerPolicy="no-referrer"
      className="size-full border-0 bg-white"
    />
  );
}
