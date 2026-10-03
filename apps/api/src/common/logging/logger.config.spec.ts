import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveRequestId } from './logger.config.js';

function call(header?: string) {
  const headers: Record<string, string> = {};
  const req = {
    headers: header === undefined ? {} : { 'x-request-id': header },
  } as IncomingMessage;
  const res = {
    setHeader: (name: string, value: string) => (headers[name] = value),
  } as unknown as ServerResponse;
  const id = resolveRequestId(req, res);
  return { id, echoed: headers['x-request-id'] };
}

describe('resolveRequestId', () => {
  it('reuses a well-formed incoming id and echoes it', () => {
    expect(call('trace-123.abc')).toEqual({ id: 'trace-123.abc', echoed: 'trace-123.abc' });
  });

  it.each([undefined, '', 'has spaces', 'x'.repeat(129), 'inject\nnewline'])(
    'generates a UUID for missing or malformed ids (%j)',
    (header) => {
      const { id, echoed } = call(header);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(echoed).toBe(id);
    },
  );
});
