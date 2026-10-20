// GET /events/stream in index-only mode: replays what the client missed (Last-Event-ID), then follows the index by polling
// ledger_events. A serverless function cannot hold a stream open for ever, so it closes after about 50 s; EventSource reconnects
// by itself (retry: 3000) and sends Last-Event-ID, so no event is lost.
import { asc, gt, max } from 'drizzle-orm';
import { ledgerEvents } from '../../../src/gateway/db/schema';
import { toStreamEvent } from '../../../src/gateway/routes/events';
import { originAllowed } from '../../../src/gateway/services/origin';
import { getReadApi } from '../../../src/instance';
import { handle } from '../../../src/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const OPTIONS = handle;

const OPEN_FOR_MS = 50_000, POLL_MS = 2_000;

export async function GET(req: Request): Promise<Response> {
  const { ctx } = await getReadApi();
  const origin = req.headers.get('origin');
  const url = new URL(req.url);
  const resume = req.headers.get('last-event-id') ?? url.searchParams.get('lastEventId');
  let lastSent = Number(resume ?? 0) || 0;
  // without Last-Event-ID the client wants new events only, as on the live gateway
  if (resume === null) lastSent = Number((await ctx.db.select({ n: max(ledgerEvents.id) }).from(ledgerEvents))[0]?.n ?? 0);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { /* client gone */ } };
      send('retry: 3000\n\n');
      const until = Date.now() + OPEN_FOR_MS;
      while (!req.signal.aborted && Date.now() < until) {
        try {
          const rows = await ctx.db.select().from(ledgerEvents).where(gt(ledgerEvents.id, lastSent)).orderBy(asc(ledgerEvents.id)).limit(500);
          for (const r of rows) { lastSent = r.id; send(`id: ${r.id}\nevent: ledger\ndata: ${JSON.stringify(toStreamEvent(r))}\n\n`); }
          if (!rows.length) send(': keep-alive\n\n');
        } catch { send(': index temporarily unreachable\n\n'); }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no', 'X-Ledger-Mode': 'index-only',
      ...(origin && originAllowed(ctx.cfg.corsOrigins, origin) ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-expose-headers': 'X-Ledger-Mode' } : {}),
    },
  });
}
