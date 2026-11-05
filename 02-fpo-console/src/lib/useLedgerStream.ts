'use client';
import { useEffect, useRef } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { StreamEvent } from '@/contract/contract';
import { extraHeadersFor, getConn, resolveBase, subscribeConn } from './api';

const POLL_MS = 30_000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * One hook for live updates (PORTAL_COMMON.md section B).
 *  - live: GET /events/stream through fetch() so the ngrok header can be sent (a native EventSource cannot set headers; RUNBOOK section 3).
 *    Reconnects with backoff; Last-Event-ID is resent by the library.
 *  - index-only: no stream is held open; `onPoll` fires every 30 s instead.
 */
export function useLedgerStream(handlers: { onEvent?: (e: StreamEvent) => void; onPoll?: () => void }) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let stopped = false;
    let ac: AbortController | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let failures = 0;

    const stopAll = () => { ac?.abort(); ac = null; if (pollTimer) clearInterval(pollTimer); pollTimer = null; };

    const start = async () => {
      stopAll();
      const base = await resolveBase();
      if (stopped) return;
      if (!base || getConn().mode !== 'live') {
        pollTimer = setInterval(() => ref.current.onPoll?.(), POLL_MS);
        return;
      }
      ac = new AbortController();
      const mine = ac;
      fetchEventSource(`${base}/events/stream`, {
        signal: mine.signal,
        openWhenHidden: true,
        headers: { accept: 'text/event-stream', ...extraHeadersFor(base) },
        async onopen(res) {
          if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) throw new Error(`stream refused: ${res.status}`);
          failures = 0;
        },
        onmessage(m) {
          if (!m.data) return;
          try { ref.current.onEvent?.(JSON.parse(m.data) as StreamEvent); } catch { /* ignore a malformed frame */ }
        },
        onerror() {
          if (stopped || mine.signal.aborted) throw new Error('stopped');
          // retry with backoff. After 3 drops re-probe /health: it only switches to index-only (and polling) when /health fails
          // twice in a row, so a stream hiccup on the ngrok tunnel keeps us live and the stream just reconnects
          const wait = BACKOFF_MS[Math.min(failures++, BACKOFF_MS.length - 1)]!;
          if (failures >= 3) { void resolveBase(true).then(() => { if (!stopped && getConn().mode !== 'live') void start(); }); }
          return wait;
        },
      }).catch(() => { /* aborted or gave up; the mode subscription below restarts us */ });
    };

    void start();
    // when the connection mode flips (gateway woke up or went to sleep), switch between stream and polling
    let lastMode = getConn().mode;
    const unsub = subscribeConn(() => { const m = getConn().mode; if (m !== lastMode) { lastMode = m; void start(); } });
    return () => { stopped = true; unsub(); stopAll(); };
  }, []);
}
