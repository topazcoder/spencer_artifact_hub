import { Fragment } from 'react';
import { splitLinks } from '@/lib/split-links.ts';

/** A comment's text as written: never HTML; `http(s)` links open in a new tab. */
export function CommentBody({ text }: { text: string }) {
  return (
    <p className="text-sm break-words whitespace-pre-line">
      {splitLinks(text).map((part, index) =>
        part.type === 'link' ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </p>
  );
}
