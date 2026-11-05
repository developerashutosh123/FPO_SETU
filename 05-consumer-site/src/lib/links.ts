import { deepLink, type PortalUrls } from '@/contract/contract';

const trim = (s: string | undefined) => (s ?? '').replace(/\/+$/, '');
/** Only the Gov explorer is linked from this site (consumers never see the internal portals). */
const GOV = trim(process.env.NEXT_PUBLIC_URL_GOV);
const urls = { gov: GOV } as PortalUrls;

/** Explorer link for a tx ID, or null when the Gov portal URL is not configured. */
export const govTxUrl = (txId: string): string | null => (GOV ? deepLink.govTx(urls, txId) : null);
