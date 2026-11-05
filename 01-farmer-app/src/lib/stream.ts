import type { StreamEvent } from '../contract/contract';
import { extraHeadersFor, getConn, resolveBase } from './api';

/**
 * GET /events/stream read with fetch() + a stream reader, not EventSource: a native EventSource cannot send the ngrok header, so through the
 * free tunnel it receives the interstitial page (RUNBOOK section 3, fix 2). Reconnects with backoff; a dropped stream re-probes /health first.
 * In index-only mode there is no live stream to follow, so it polls instead (`onPoll` every 30 s).
 */
export function parseSse(buffer: string): { events: { id?: string; data: string }[]; rest: string } {
  const events: { id?: string; data: string }[] = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  for (const b of blocks) {
    let id: string | undefined;
    const data: string[] = [];
    for (const line of b.split(/\r?\n/)) {
      if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length) events.push({ id, data: data.join('\n') });
  }
  return { events, rest };
}

export function openLedgerStream(handlers: { onEvent: (e: StreamEvent) => void; onPoll?: () => void; onOpen?: () => void }): () => void {
  let closed = false;
  let ac: AbortController | null = null;
  let lastId: string | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const loop = async () => {
    let delay = 1000;
    while (!closed) {
      const base = await resolveBase();
      if (!base) { await sleep(Math.min(delay, 15000)); delay *= 2; continue; }
      if (getConn().mode === 'index-only') {
        if (!pollTimer) pollTimer = setInterval(() => handlers.onPoll?.(), 30_000);
        await sleep(30_000);
        await resolveBase(true);
        continue;
      }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; }
      ac = new AbortController();
      try {
        const headers: Record<string, string> = { accept: 'text/event-stream', ...extraHeadersFor(base) };
        if (lastId) headers['last-event-id'] = lastId;
        const res = await fetch(`${base}/events/stream`, { headers, signal: ac.signal, cache: 'no-store' });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        handlers.onOpen?.();
        delay = 1000;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { events, rest } = parseSse(buf);
          buf = rest;
          for (const ev of events) {
            if (ev.id) lastId = ev.id;
            try { handlers.onEvent(JSON.parse(ev.data) as StreamEvent); } catch { /* keep-alive or non-JSON data line */ }
          }
        }
      } catch { /* dropped or aborted */ }
      if (closed) return;
      await resolveBase(true); // a dropped stream re-probes /health instead of failing over directly
      await sleep(delay);
      delay = Math.min(delay * 2, 15000);
    }
  };
  void loop();
  return () => { closed = true; ac?.abort(); if (pollTimer) clearInterval(pollTimer); };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
