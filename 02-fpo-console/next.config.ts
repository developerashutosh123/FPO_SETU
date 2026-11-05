import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

// PORTAL_COMMON.md section B: a production build must not ship with the mock data source.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && (process.env.NEXT_PUBLIC_DATA_SOURCE ?? '').trim() !== 'live') {
    throw new Error(
      `Refusing to build: NEXT_PUBLIC_DATA_SOURCE is ${JSON.stringify(process.env.NEXT_PUBLIC_DATA_SOURCE ?? '')} but a production build needs "live". ` +
        'Set NEXT_PUBLIC_DATA_SOURCE=live, NEXT_PUBLIC_API_URL and NEXT_PUBLIC_READ_API_URL (see .env.example).',
    );
  }
  return { reactStrictMode: true };
}
