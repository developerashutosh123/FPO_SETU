import { describe, expect, it } from 'vitest';
import { extraHeadersFor } from './api';
import { parseSse } from './stream';

describe('SSE parser (fetch based, because EventSource cannot send the ngrok header)', () => {
  it('splits events, keeps a partial one for the next chunk, reads ids', () => {
    const a = parseSse('retry: 3000\n\nid: 7\ndata: {"event":"LotGraded","txId":"t1"}\n\nid: 8\ndata: {"eve');
    expect(a.events).toEqual([{ id: '7', data: '{"event":"LotGraded","txId":"t1"}' }]);
    const b = parseSse(a.rest + 'nt":"LienMarked"}\n\n');
    expect(b.events).toEqual([{ id: '8', data: '{"event":"LienMarked"}' }]);
  });
  it('ignores comments', () => expect(parseSse(': connected\n\n').events).toEqual([]));
});

describe('ngrok interstitial header (RUNBOOK section 3)', () => {
  it('goes to ngrok hosts only', () => {
    expect(extraHeadersFor('https://repaying-chant-consumer.ngrok-free.dev')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://x.ngrok-free.app')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://read-api-ten.vercel.app')).toEqual({});
    expect(extraHeadersFor('http://localhost:4010')).toEqual({});
  });
});
