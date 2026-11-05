'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { SessionUser } from '@/contract/contract';
import { SESSION_KEY, api } from './api';
import { canOpen, isFpoRole, ROLE_LABEL } from './access';
import { StateShell } from '@/components/states';
import Link from 'next/link';

interface Session { token: string; user: SessionUser }
interface AuthCtx { session: Session | null | undefined; login: (u: string, p: string) => Promise<SessionUser>; logout: () => void }
const Ctx = createContext<AuthCtx>({ session: undefined, login: async () => { throw new Error('no provider'); }, logout: () => {} });
export const useAuth = () => useContext(Ctx);

function readSession(): Session | null {
  try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null; } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => { setSession(readSession()); }, []);

  const logout = useCallback(() => { try { window.localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ } setSession(null); }, []);
  useEffect(() => { window.addEventListener('fpo:unauthenticated', logout); return () => window.removeEventListener('fpo:unauthenticated', logout); }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.login(username.trim(), password);
    const s = { token: data.token, user: data.user };
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage blocked: session lasts until reload */ }
    setSession(s);
    return data.user;
  }, []);

  return <Ctx.Provider value={{ session, login, logout }}>{children}</Ctx.Provider>;
}

/** Wrap a page. Sends signed-out visitors to /login and brings them back here afterwards; shows a plain message to a role the page is not for. */
export function RequireAuth({ children }: { children: (user: SessionUser) => ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [session, router, pathname]);
  if (session === undefined || session === null) return <StateShell kind="loading" title="Checking your sign-in" />;
  const { user } = session;
  if (!isFpoRole(user.role)) {
    return <StateShell kind="error" title="This console is for the FPO team" body={`You are signed in as ${user.displayName}. Sign in as sujata.ceo, debasis.ops, ratan.store or subhankar.vle to see this page.`} />;
  }
  if (!canOpen(user.role, pathname)) {
    return (
      <StateShell kind="error" title="This page is not part of your role"
        body={`${user.displayName} signs in as ${ROLE_LABEL[user.role] ?? user.role}. The ledger would refuse the data this page reads. Go back to Today, or sign in with another account.`}
        action={<Link className="btn no-underline" href="/">Open Today</Link>} />
    );
  }
  return <>{children(user)}</>;
}
