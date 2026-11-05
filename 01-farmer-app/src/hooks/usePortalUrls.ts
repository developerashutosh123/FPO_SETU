import { useEffect, useState } from 'react';
import type { PortalUrls } from '../contract/contract';
import { api } from '../lib/api';
import { ENV_PORTAL_URLS } from '../lib/env';

let cached: Promise<Partial<PortalUrls>> | null = null;
/** Portal URLs: env vars win, GET /config/public fills the gaps (CONTRACT.md section 9.1). Fields stay empty if neither knows them. */
export function usePortalUrls(): PortalUrls {
  const [remote, setRemote] = useState<Partial<PortalUrls>>({});
  useEffect(() => {
    cached ??= api.configPublic().then((c) => c.portalUrls).catch(() => { cached = null; return {}; });
    let live = true;
    void cached.then((u) => { if (live) setRemote(u); });
    return () => { live = false; };
  }, []);
  const pick = (k: keyof PortalUrls) => ENV_PORTAL_URLS[k] || remote[k] || '';
  return { farmerWeb: pick('farmerWeb'), fpo: pick('fpo'), bank: pick('bank'), buyer: pick('buyer'), consumer: pick('consumer'), gov: pick('gov') };
}
