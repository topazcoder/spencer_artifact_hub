import { formatBytes } from '@artifact-hub/shared';
import { FileIcon, UploadIcon } from 'lucide-react';
import { type DragEvent, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { FILE_INPUT_ACCEPT, SUPPORTED_FORMATS_LABEL } from './artifact-types.ts';

interface FileDropZoneProps {
  file: File | null;
  onFileChange: (file: File) => void;
  maxBytes?: number;
  error?: string;
  disabled?: boolean;
}

/**
 * Pick a file with the system dialog or drop it here. The whole zone is the label of a
 * visually hidden file input, so it works with the keyboard and screen readers too.
 */
export function FileDropZone({ file, onFileChange, maxBytes, error, disabled }: FileDropZoneProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [dragging, setDragging] = useState(false);

  const onDragOver = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !disabled) onFileChange(dropped);
  };

  return (
    <div className="grid gap-2">
      <label
        htmlFor={inputId}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
          dragging ? 'border-primary bg-accent' : 'hover:bg-accent/50',
          error && 'border-destructive',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {file ? (
          <>
            <FileIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(file.size)} · Click or drop to choose another file
            </span>
          </>
        ) : (
          <>
            <UploadIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">Drop a file here, or click to choose one</span>
            <span className="text-xs text-muted-foreground">
              {SUPPORTED_FORMATS_LABEL}
              {maxBytes ? `, up to ${formatBytes(maxBytes)}` : ''}
            </span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          className="sr-only"
          disabled={disabled}
          aria-label="File"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onFileChange(chosen);
            // Allow choosing the same file again after an error.
            event.target.value = '';
          }}
        />
      </label>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
