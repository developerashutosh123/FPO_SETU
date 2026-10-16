import { resolve } from 'node:path';
import { z } from 'zod';

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Supabase pooled connection string)'),
  DIRECT_URL: z.string().optional(),
  /** Postgres connections per process. Raise it for a remote database: every query costs a network round trip (57 ms to Supabase Mumbai from WSL). */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(60).default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters (openssl rand -hex 32)'),
  FARMER_TOKEN_SECRET: z.string().min(32, 'FARMER_TOKEN_SECRET must be at least 32 characters'),
  PRICE_SALT_SECRET: z.string().min(32, 'PRICE_SALT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3006'),
  NETWORK_DIR: z.string().default('../network'),
  WALLET_DIR: z.string().default('../wallet'),
  DATAGOVIN_API_KEY: z.string().optional(),
  DEMO_PASSWORD: z.string().default('Setu@2026'),
  DEMO_OTP: z.string().default('123456'),
  URL_FARMER_WEB: z.string().default('http://localhost:3001'),
  URL_FPO: z.string().default('http://localhost:3002'),
  URL_BANK: z.string().default('http://localhost:3003'),
  URL_BUYER: z.string().default('http://localhost:3004'),
  URL_CONSUMER: z.string().default('http://localhost:3005'),
  URL_GOV: z.string().default('http://localhost:3006'),
  READ_API_URL: z.string().default(''),
  /** Orderer operations endpoints (Prometheus metrics) used to find the Raft leader of each channel. name=url, comma separated. */
  ORDERER_OPS: z.string().default('orderer1.setu.local=http://localhost:9443,orderer2.setu.local=http://localhost:9453,orderer3.setu.local=http://localhost:9463'),
  /** Set by tests that run without a ledger. */
  FABRIC_DISABLED: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof schema> & { corsOrigins: string[]; networkDir: string; walletDir: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration (see .env.example):\n${lines}`);
  }
  const c = parsed.data;
  return { ...c, corsOrigins: csv(c.CORS_ORIGINS), networkDir: resolve(c.NETWORK_DIR), walletDir: resolve(c.WALLET_DIR) };
}
