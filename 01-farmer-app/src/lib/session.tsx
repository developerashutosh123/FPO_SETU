import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginResponse, SessionUser } from '../contract/contract';
import { SESSION_KEY, UNAUTH_EVENT } from './api';
import { kvDel, kvGetJson, kvSet } from './kv';

interface Stored { token: string; user: SessionUser }
interface Ctx { user: SessionUser | null; signIn: (r: LoginResponse) => void; signOut: () => void }
const SessionCtx = createContext<Ctx>({ user: null, signIn: () => {}, signOut: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(() => kvGetJson<Stored>(SESSION_KEY));
  const signIn = useCallback((r: LoginResponse) => { const s = { token: r.token, user: r.user }; kvSet(SESSION_KEY, JSON.stringify(s)); setStored(s); }, []);
  const signOut = useCallback(() => { kvDel(SESSION_KEY); setStored(null); }, []);
  useEffect(() => {
    // the API client dispatches this when the gateway says the token is no longer valid
    globalThis.addEventListener?.(UNAUTH_EVENT, signOut);
    return () => globalThis.removeEventListener?.(UNAUTH_EVENT, signOut);
  }, [signOut]);
  const value = useMemo(() => ({ user: stored?.user ?? null, signIn, signOut }), [stored, signIn, signOut]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
export const useSession = () => useContext(SessionCtx);
