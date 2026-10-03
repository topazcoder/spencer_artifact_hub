import type { IncomingMessage } from 'node:http';
import { ErrorCode } from '@artifact-hub/shared';
import busboy from 'busboy';
import { AppError } from '../../common/errors/app-error.js';
import { ByteMeter } from '../content/byte-meter.js';
import type { MultipartUpload, MultipartUploadOptions } from './multipart.types.js';

/** The form field that carries the file. */
export const FILE_FIELD = 'file';
const MAX_FIELDS = 5;
const MAX_FIELD_BYTES = 16 * 1024;
/** Room for the text fields and part headers on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = MAX_FIELDS * MAX_FIELD_BYTES + 16 * 1024;

/**
 * Streams a `multipart/form-data` upload: resolves as soon as the `file` part starts, with the
 * text fields sent before it and the file as an unread stream. Nothing is buffered in memory
 * or on disk. Clients must send their fields first (`FormData` keeps insertion order).
 */
export function readMultipartUpload(
  req: IncomingMessage,
  { maxFileBytes }: MultipartUploadOptions,
): Promise<MultipartUpload> {
  const maxRequestBytes = maxFileBytes + MULTIPART_OVERHEAD_BYTES;

  // Browsers always send Content-Length for FormData: reject before reading anything.
  if (Number(req.headers['content-length']) > maxRequestBytes) {
    discard(req);
    return Promise.reject(ByteMeter.tooLarge(maxFileBytes));
  }

  let parser: busboy.Busboy;
  try {
    parser = busboy({
      headers: req.headers,
      limits: { files: 1, fields: MAX_FIELDS, fieldSize: MAX_FIELD_BYTES, parts: MAX_FIELDS + 1 },
    });
  } catch {
    discard(req);
    return Promise.reject(badRequest('Send the file as multipart/form-data.'));
  }

  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let settled = false;

    const stop = () => {
      req.unpipe(parser);
      discard(req);
    };
    const fail = (error: AppError) => {
      if (settled) return;
      settled = true;
      stop();
      reject(error);
    };

    parser.on('field', (name, value, info) => {
      if (settled) return;
      if (info.valueTruncated) {
        fail(badRequest(`The "${name.slice(0, 40)}" field is too long.`));
        return;
      }
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (settled || name !== FILE_FIELD) {
        stream.resume();
        return;
      }
      settled = true;
      resolve({ fields, file: { stream, filename: info.filename ?? '' }, discard: stop });
    });
    parser.on('error', () => fail(badRequest('The upload could not be read.')));
    parser.on('close', () => fail(badRequest(`Add a file in the "${FILE_FIELD}" field.`)));

    // Busboy is not told when the client goes away; without this the file stream never ends.
    req.on('error', (error) => parser.destroy(error));
    req.on('close', () => {
      if (!req.complete) parser.destroy(new Error('Request aborted'));
    });
    req.pipe(parser);
  });
}

/**
 * Reads and drops the rest of the request, so the error response reaches the client instead
 * of a connection reset. Node's `requestTimeout` (5 min) bounds how long a client can keep
 * sending.
 */
function discard(req: IncomingMessage): void {
  if (req.complete || req.destroyed) return;
  req.resume();
}

function badRequest(message: string): AppError {
  return new AppError(ErrorCode.BAD_REQUEST, message);
}
