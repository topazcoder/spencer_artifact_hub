import { useState } from 'react';
import { InlineError } from '@/components/inline-status.tsx';

/** Raster images and SVG. An `<img>` never runs scripts inside an SVG. */
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <InlineError error="Couldn't load the image. Try downloading it instead." />;
  return (
    <div className="flex size-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[24px_24px] p-4">
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
