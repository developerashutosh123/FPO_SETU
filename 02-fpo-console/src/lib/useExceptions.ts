'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AuditSample, LotListItem, LotPassport, Role } from '@/contract/contract';
import { api } from './api';
import { createLimiter } from './limiter';
import { ACTIVE_STATUSES, exceptionsFrom, type LotException } from './queue';

/** Passports are read one by one (the list has no PHI or cold-chain fields), so the number read is capped and the page says how many. */
export const MAX_PASSPORTS = 40;
const IN_FLIGHT = 6;

export interface ExceptionsState { loading: boolean; exceptions: LotException[]; checked: number; eligible: number; auditChecked: boolean }

export function useExceptions(lots: LotListItem[] | undefined, role: Role): ExceptionsState {
  const candidates = useMemo(() => (lots ?? []).filter((l) => ACTIVE_STATUSES.includes(l.status)), [lots]);
  const picked = useMemo(() => candidates.slice(0, MAX_PASSPORTS), [candidates]);
  const key = picked.map((l) => `${l.sscc}:${l.status}`).join(',');
  const [state, setState] = useState<ExceptionsState>({ loading: true, exceptions: [], checked: 0, eligible: 0, auditChecked: false });

  useEffect(() => {
    if (lots === undefined) return;
    const ac = new AbortController();
    const run = createLimiter(IN_FLIGHT);
    (async () => {
      const [passports, audit] = await Promise.all([
        Promise.all(picked.map((l) => run(() => api.lot(l.sscc, ac.signal)).then((r) => r.data as LotPassport).catch(() => null))),
        role === 'ceo' ? api.auditSample(ac.signal).then((r) => r.data as AuditSample).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      if (ac.signal.aborted) return;
      const ok = passports.filter((p): p is LotPassport => p !== null);
      setState({ loading: false, exceptions: exceptionsFrom(ok, audit), checked: ok.length, eligible: candidates.length, auditChecked: audit !== undefined });
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, role, lots === undefined]);

  return state;
}
