import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
// Vite's `?url` import (the worker's URL); oxlint can't resolve it.
// oxlint-disable-next-line import/default
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { isApiError } from '@/lib/api/api-error.ts';
import { fetchContentBytes } from '../artifacts-api.ts';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Rendering every page of a huge PDF up front would stall the tab. */
const MAX_PAGES = 100;

type PdfState =
  | { status: 'loading' }
  | { status: 'ready'; pageCount: number }
  | { status: 'error'; error: unknown };

/**
 * Renders a PDF to canvases with pdf.js. Browsers refuse to show PDFs in their built-in viewer
 * under a CSP sandbox, so we fetch the bytes and draw the pages ourselves. pdf.js never runs
 * the document's own JavaScript (and since v6 doesn't use `eval` either). Loaded lazily
 * (default export for `React.lazy`), so pdf.js is only downloaded for PDFs.
 */
export default function PdfViewer(props: { contentPath: string }) {
  // "Try again" remounts the document with a fresh state.
  const [attempt, setAttempt] = useState(0);
  return <PdfDocument key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

function PdfDocument({ contentPath, onRetry }: { contentPath: string; onRetry: () => void }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PdfState>({ status: 'loading' });

  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | undefined;
    // StrictMode runs effects twice on the same node; start from an empty page list.
    container.replaceChildren();

    (async () => {
      const data = await fetchContentBytes(contentPath, controller.signal);
      task = getDocument({ data });
      const doc = await task.promise;
      setState({ status: 'ready', pageCount: doc.numPages });

      const width = container.clientWidth;
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
        if (controller.signal.aborted) return;
        const page = await doc.getPage(n);
        const scale = (width / page.getViewport({ scale: 1 }).width) * window.devicePixelRatio;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = 'h-auto w-full bg-white shadow-sm';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
        container.append(canvas);
        await page.render({ canvas, viewport }).promise;
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', error });
    });

    return () => {
      controller.abort();
      void task?.destroy();
    };
  }, [contentPath]);

  return (
    <div className="relative size-full overflow-auto bg-muted">
      {state.status === 'loading' ? (
        <div className="absolute inset-0">
          <InlineLoading />
        </div>
      ) : null}
      {state.status === 'error' ? (
        <InlineError
          error={
            isApiError(state.error)
              ? state.error
              : "Couldn't display this PDF. Download it to open it in another app."
          }
          onRetry={onRetry}
        />
      ) : null}
      {state.status === 'ready' && state.pageCount > MAX_PAGES ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">
          Showing the first {MAX_PAGES} of {state.pageCount} pages. Download the PDF to see them
          all.
        </p>
      ) : null}
      <div
        ref={pagesRef}
        className="mx-auto grid max-w-4xl gap-4 p-4"
        hidden={state.status === 'error'}
      />
    </div>
  );
}
