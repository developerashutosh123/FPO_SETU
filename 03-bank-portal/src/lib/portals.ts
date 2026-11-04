import { deepLink, type PortalUrls } from '@/contract/contract';

/**
 * Other portals' URLs, from env (contract section 9.1). `NEXT_PUBLIC_*` must be read as literal property accesses so Next inlines them.
 * Without env: local ports in development (3001..3006), the documented Vercel names otherwise (RUNBOOK section 0).
 */
const dev = process.env.NEXT_PUBLIC_DATA_SOURCE !== 'live';
const pick = (v: string | undefined, local: string, prod: string) => (v ?? (dev ? local : prod)).replace(/\/+$/, '');
export const PORTALS: PortalUrls = {
  farmerWeb: pick(process.env.NEXT_PUBLIC_URL_FARMER_WEB, 'http://localhost:3001', 'https://fposetu-farmer.vercel.app'),
  fpo: pick(process.env.NEXT_PUBLIC_URL_FPO, 'http://localhost:3002', 'https://fposetu-fpo.vercel.app'),
  bank: pick(process.env.NEXT_PUBLIC_URL_BANK, 'http://localhost:3003', 'https://fposetu-bank.vercel.app'),
  buyer: pick(process.env.NEXT_PUBLIC_URL_BUYER, 'http://localhost:3004', 'https://fposetu-buyer.vercel.app'),
  consumer: pick(process.env.NEXT_PUBLIC_URL_CONSUMER, 'http://localhost:3005', 'https://fposetu-consumer.vercel.app'),
  gov: pick(process.env.NEXT_PUBLIC_URL_GOV, 'http://localhost:3006', 'https://fposetu-gov.vercel.app'),
};
export const govTxUrl = (txId: string) => deepLink.govTx(PORTALS, txId);
export const govLotUrl = (sscc: string) => deepLink.govLot(PORTALS, sscc);
/** FPO console collateral page. Release unlocks dispatch there (golden journey step 8). */
export const fpoCollateralUrl = (enwr: string) => deepLink.fpoCollateral(PORTALS, enwr);
/** Set NEXT_PUBLIC_DEMO_MODE=true to show the duplicate-pledge demo button. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
