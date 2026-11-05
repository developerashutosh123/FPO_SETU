'use client';
import { useEffect, useRef } from 'react';
import type { LedgerEventName, StreamEvent } from '@/contract/contract';
import { LEDGER_EVENTS } from '@/contract/contract';
import { extraHeadersFor, getConn, resolveBase } from './api';

/**
 * Server-Sent Events over fetch(), because a native EventSource cannot send the ngrok-skip-browser-warning header and the free ngrok
 * domain answers it with an interstitial instead of the stream (RUNBOOK section 3, fix 2).
 */

export interface SseFrame { event: string; id?: string; data: string }

/** Splits a text buffer into complete SSE frames and returns the unparsed tail. Comment lines (": ...") and bare retry lines yield no frame. */
export function parseSse(buffer: string): { frames: SseFrame[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, '\n');
  const parts = normalised.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames: SseFrame[] = [];
  for (const block of parts) {
    let event = 'message';
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'id') id = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) frames.push({ event, id, data: data.join('\n') });
  }
  return { frames, rest };
}

const isStreamEvent = (x: unknown): x is StreamEvent => {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return typeof e.txId === 'string' && typeof e.channel === 'string' && (LEDGER_EVENTS as readonly string[]).includes(e.event as LedgerEventName);
};

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res) => {
  const t = setTimeout(res, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
});

/**
 * One hook for live updates (PORTAL_COMMON section B). Reconnects with backoff and Last-Event-ID; after a drop it re-probes /health through
 * resolveBase() instead of failing over directly. In index-only mode there is no live stream: the header pill polls /ledger/status, and this
 * hook just waits and checks again whether the gateway came back.
 */
export function useLedgerStream(onEvent: (e: StreamEvent) => void, enabled = true) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    let lastId: string | undefined;
    let attempt = 0;

    (async () => {
      while (!ac.signal.aborted) {
        const base = await resolveBase(attempt > 0);
        if (ac.signal.aborted) return;
        if (!base || getConn().mode !== 'live') { await sleep(30_000, ac.signal); attempt = 0; continue; }
        try {
          const res = await fetch(`${base}/events/stream`, {
            headers: { accept: 'text/event-stream', ...extraHeadersFor(base), ...(lastId ? { 'last-event-id': lastId } : {}) },
            cache: 'no-store', signal: ac.signal,
          });
          if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) throw new Error('not an event stream');
          attempt = 0;
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const { frames, rest } = parseSse(buf);
            buf = rest;
            for (const f of frames) {
              if (f.id) lastId = f.id;
              try { const parsed: unknown = JSON.parse(f.data); if (isStreamEvent(parsed)) handler.current(parsed); } catch { /* ignore a malformed frame */ }
            }
          }
        } catch {
          if (ac.signal.aborted) return;
        }
        await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!, ac.signal);
        attempt++;
      }
    })();

    return () => ac.abort();
  }, [enabled]);
}
