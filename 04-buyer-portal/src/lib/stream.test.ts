import { describe, expect, it } from 'vitest';
import { parseSse } from './stream';

describe('parseSse', () => {
  it('parses complete frames, skips comments and keeps the unfinished tail', () => {
    const text = ': connected\nretry: 3000\n\nevent: ledger\nid: 7\ndata: {"a":1}\n\nevent: ledger\nid: 8\ndata: {"a"';
    const { frames, rest } = parseSse(text);
    expect(frames).toEqual([{ event: 'ledger', id: '7', data: '{"a":1}' }]);
    expect(rest).toBe('event: ledger\nid: 8\ndata: {"a"');
  });
  it('handles CRLF and multi-line data', () => {
    const { frames } = parseSse('id: 1\r\ndata: x\r\ndata: y\r\n\r\n');
    expect(frames).toEqual([{ event: 'message', id: '1', data: 'x\ny' }]);
  });
  it('completes a frame split across two chunks', () => {
    const a = parseSse('event: ledger\ndata: {"k"');
    const b = parseSse(a.rest + ':2}\n\n');
    expect(b.frames[0]?.data).toBe('{"k":2}');
  });
});
