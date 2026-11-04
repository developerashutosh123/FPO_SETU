'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { SessionUser } from '@/contract/contract';
import { SESSION_KEY, api } from './api';
import { StateShell } from '@/components/states';

interface Session { token: string; user: SessionUser }
interface AuthCtx { session: Session | null | undefined; login: (u: string, p: string) => Promise<SessionUser>; logout: () => void }
const Ctx = createContext<AuthCtx>({ session: undefined, login: async () => { throw new Error('no provider'); }, logout: () => {} });
export const useAuth = () => useContext(Ctx);

/** The bank portal is for the credit officer only (contract section 5). */
export const isCreditOfficer = (u: SessionUser) => u.role === 'credit_officer';

function readSession(): Session | null {
  try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null; } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => { setSession(readSession()); }, []);

  const logout = useCallback(() => { try { window.localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ } setSession(null); }, []);
  useEffect(() => { window.addEventListener('bank:unauthenticated', logout); return () => window.removeEventListener('bank:unauthenticated', logout); }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.login(username.trim(), password);
    const s = { token: data.token, user: data.user };
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage blocked: session lasts until reload */ }
    setSession(s);
    return data.user;
  }, []);

  return <Ctx.Provider value={{ session, login, logout }}>{children}</Ctx.Provider>;
}

/** Wrap a page. Sends signed-out visitors to /login and brings them back here afterwards. */
export function RequireAuth({ children }: { children: (user: SessionUser) => ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [session, router, pathname]);
  if (session === undefined || session === null) return <StateShell kind="loading" title="Checking your sign-in" />;
  if (!isCreditOfficer(session.user)) {
    return <StateShell kind="error" title="This portal is for the credit officer" body={`You are signed in as ${session.user.displayName}. Sign in as arindam.bank to see this page.`} />;
  }
  return <>{children(session.user)}</>;
}
