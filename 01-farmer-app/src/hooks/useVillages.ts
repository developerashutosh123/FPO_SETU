import { useEffect, useState } from 'react';
import type { Village } from '../contract/contract';
import { api } from '../lib/api';

let cached: Promise<Village[]> | null = null;
/** Village names in the user's script come from GET /villages (nameBn), never from a list typed into the app. */
export function useVillageName(code: string | undefined, lang: string): string | undefined {
  const [list, setList] = useState<Village[]>([]);
  useEffect(() => {
    cached ??= api.villages().catch(() => { cached = null; return [] as Village[]; });
    let live = true;
    void cached.then((v) => { if (live) setList(v); });
    return () => { live = false; };
  }, []);
  const v = list.find((x) => x.code === code);
  return v ? (lang === 'bn' ? v.nameBn : v.name) : undefined;
}
