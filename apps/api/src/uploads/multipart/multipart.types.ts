import type { Readable } from 'node:stream';

export interface MultipartUploadOptions {
  /** Largest file accepted; the file stream itself is limited by `ContentInspectorService`. */
  maxFileBytes: number;
}

export interface MultipartUpload {
  /** Text fields sent before the file. Fields after it are ignored. */
  fields: Record<string, string>;
  file: {
    /** Unread: consume it, or call `discard()`. */
    stream: Readable;
    /** As sent by the client; sanitize before storing or displaying. */
    filename: string;
  };
  /**
   * Stops parsing and drains the rest of the request; respond once it resolves, so the error
   * response reaches the client, proxies included. Call it when the upload is rejected.
   */
  discard(): Promise<void>;
}
