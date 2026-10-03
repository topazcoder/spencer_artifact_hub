import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { text } from 'node:stream/consumers';
import { ErrorCode } from '@artifact-hub/shared';
import { readMultipartUpload } from './read-multipart-upload.js';

const BOUNDARY = 'test-boundary';
const MAX = 1024;

type FakeRequest = PassThrough & { headers: IncomingMessage['headers']; complete: boolean };

/** A request stream with headers; `complete` turns true when the body has been fully sent. */
function fakeRequest(headers: IncomingMessage['headers'] = {}): FakeRequest {
  const req = new PassThrough() as FakeRequest;
  req.headers = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, ...headers };
  req.complete = false;
  return req;
}

function field(name: string, value: string): string {
  return `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

function fileHeader(name: string, filename: string): string {
  return (
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n'
  );
}

const END = `\r\n--${BOUNDARY}--\r\n`;

function send(req: FakeRequest, body: string): void {
  req.complete = true;
  req.end(body);
}

const read = (req: FakeRequest) =>
  readMultipartUpload(req as unknown as IncomingMessage, { maxFileBytes: MAX });

describe('readMultipartUpload', () => {
  it('resolves with the fields sent before the file and the file as a stream', async () => {
    const req = fakeRequest();
    const upload = read(req);
    send(
      req,
      field('metadata', '{"title":"x"}') + fileHeader('file', 'page.html') + '<p>hi</p>' + END,
    );

    const { fields, file } = await upload;
    expect(fields).toEqual({ metadata: '{"title":"x"}' });
    expect(file.filename).toBe('page.html');
    expect(await text(file.stream)).toBe('<p>hi</p>');
  });

  it('ignores fields sent after the file', async () => {
    const req = fakeRequest();
    const upload = read(req);
    send(req, fileHeader('file', 'b.md') + '# yes\r\n' + field('metadata', 'late') + END.slice(2));

    const { fields, file } = await upload;
    expect(fields).toEqual({});
    expect(await text(file.stream)).toBe('# yes');
  });

  it('accepts exactly one file part, named "file"', async () => {
    const req = fakeRequest();
    const upload = read(req);
    send(req, fileHeader('attachment', 'a.md') + '# no\r\n' + fileHeader('file', 'b.md') + END);
    await expect(upload).rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
  });

  it('rejects an upload without a file', async () => {
    const req = fakeRequest();
    const upload = read(req);
    send(req, field('metadata', '{}') + END.slice(2));
    await expect(upload).rejects.toMatchObject({
      code: ErrorCode.BAD_REQUEST,
      message: expect.stringContaining('"file"'),
    });
  });

  it('rejects requests that are not multipart', async () => {
    const req = fakeRequest({ 'content-type': 'application/json' });
    await expect(read(req)).rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
  });

  it('rejects a Content-Length over the limit before reading the body', async () => {
    const req = fakeRequest({ 'content-length': String(10 * 1024 * 1024) });
    await expect(read(req)).rejects.toMatchObject({
      code: ErrorCode.ARTIFACT_TOO_LARGE,
      details: { maxBytes: MAX },
    });
  });

  it('rejects oversized text fields', async () => {
    const req = fakeRequest();
    const upload = read(req);
    send(req, field('metadata', 'x'.repeat(20 * 1024)) + fileHeader('file', 'a.md') + '#' + END);
    await expect(upload).rejects.toMatchObject({
      code: ErrorCode.BAD_REQUEST,
      message: expect.stringContaining('too long'),
    });
  });

  it('fails the file stream when the client disconnects mid-upload', async () => {
    const req = fakeRequest();
    const upload = read(req);
    req.write(fileHeader('file', 'big.md') + '# partial');

    const { file } = await upload;
    const content = text(file.stream);
    req.destroy();
    await expect(content).rejects.toThrow();
  });
});
