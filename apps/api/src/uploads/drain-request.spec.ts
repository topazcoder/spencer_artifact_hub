import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { drainRequest } from './drain-request.js';

/** A request whose body arrives as it is written; `complete` once it has ended. */
function fakeRequest() {
  const req = new PassThrough() as PassThrough & { complete: boolean };
  req.complete = false;
  req.on('end', () => {
    req.complete = true;
  });
  return req;
}

describe('drainRequest', () => {
  it('resolves once the rest of the body has arrived', async () => {
    const req = fakeRequest();
    let drained = false;
    const promise = drainRequest(req as unknown as IncomingMessage, 1024).then(() => {
      drained = true;
    });
    req.write(Buffer.alloc(100));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drained).toBe(false);
    req.end(Buffer.alloc(100));
    await promise;
    expect(drained).toBe(true);
  });

  it('closes the connection past the limit instead of reading on', async () => {
    const req = fakeRequest();
    const promise = drainRequest(req as unknown as IncomingMessage, 150);
    req.write(Buffer.alloc(100));
    req.write(Buffer.alloc(100));
    await promise;
    expect(req.destroyed).toBe(true);
  });

  it('does nothing for a request that has already ended', async () => {
    const req = fakeRequest();
    req.complete = true;
    await expect(drainRequest(req as unknown as IncomingMessage, 10)).resolves.toBeUndefined();
  });
});
