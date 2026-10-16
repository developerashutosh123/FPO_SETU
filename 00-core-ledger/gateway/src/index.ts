import { createServer, ensureDevicesRegistered } from './server.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
const s = await createServer({ cfg, startIndexer: true, startWorkers: true });
ensureDevicesRegistered(s.ctx).then((d) => s.app.log.info({ registered: d }, 'device keys checked')).catch((e) => s.app.log.warn({ err: String(e) }, 'device registration skipped (is the network up?)'));
await s.app.listen({ port: cfg.PORT, host: cfg.HOST });
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { s.stop().then(() => process.exit(0)); });
