import type { IncomingMessage } from 'node:http';

/**
 * Reads and drops the rest of a request body, and resolves once it has all arrived. Answer a
 * rejected upload only after this: a reply sent while the client is still sending breaks the
 * connection for proxies in between (Vite's dev proxy, a hosting edge), and the client gets an
 * empty 502 instead of the reason. Past `maxBytes` the connection is closed instead.
 */
export function drainRequest(req: IncomingMessage, maxBytes: number): Promise<void> {
  if (req.complete || req.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    let received = 0;
    const done = () => {
      req.off('data', onData);
      req.off('end', done);
      req.off('close', done);
      req.off('error', done);
      resolve();
    };
    const onData = (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        done();
      }
    };
    req.on('data', onData);
    req.once('end', done);
    req.once('close', done);
    req.once('error', done);
    req.resume();
  });
}
