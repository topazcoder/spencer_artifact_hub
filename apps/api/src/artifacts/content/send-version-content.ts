import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import type { ArtifactContent } from '../artifacts.types.js';
import { attachmentDisposition, downloadFilename } from './content-disposition.js';
import { CONTENT_SECURITY_HEADERS, etagMatches, servedContentType } from './content-headers.js';

/**
 * Streams a version's bytes with the sandbox headers (plan §7), after the caller's access
 * check. `download` saves it as a file. The ETag is the content hash, so revalidation is a
 * 304 that never touches storage. Writes the response itself: Nest would reset a 304 to 200.
 */
export async function sendVersionContent(
  req: Request,
  res: Response,
  { artifact, version, open }: ArtifactContent,
  {
    download,
    headers = {},
    logger,
  }: { download: boolean; headers?: Record<string, string>; logger: PinoLogger },
): Promise<void> {
  const etag = `"${version.sha256}"`;
  res.set(CONTENT_SECURITY_HEADERS).set(headers).set('ETag', etag);
  if (etagMatches(req.get('If-None-Match'), etag)) {
    res.status(304).end();
    return;
  }

  const body = await open();
  res.set({
    'Content-Type': servedContentType(version.mimeType),
    'Content-Length': String(version.sizeBytes),
    'Content-Disposition': download
      ? attachmentDisposition(
          downloadFilename(version.originalFilename, artifact.title, version.mimeType),
        )
      : 'inline',
  });
  try {
    await pipeline(body, res);
  } catch (err) {
    // Headers are sent by now; the client sees a truncated response.
    logger.warn(
      { err, artifactId: artifact.id, versionNo: version.versionNo },
      'Content stream failed',
    );
  }
}
