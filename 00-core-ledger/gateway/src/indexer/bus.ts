import { EventEmitter } from 'node:events';
import type { StreamEvent } from '../contract/contract.js';

/** In-process fan-out of indexed ledger events to SSE subscribers. Events carry no PII and no price. */
export class EventBus {
  private em = new EventEmitter();
  constructor() { this.em.setMaxListeners(0); }
  publish(id: number, ev: StreamEvent) { this.em.emit('event', { id, ev }); }
  subscribe(fn: (m: { id: number; ev: StreamEvent }) => void): () => void { this.em.on('event', fn); return () => this.em.off('event', fn); }
  get listenerCount() { return this.em.listenerCount('event'); }
}
