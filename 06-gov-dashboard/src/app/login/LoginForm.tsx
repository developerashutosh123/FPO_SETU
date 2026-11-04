'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useAuth, MONITOR_ROLES } from '@/lib/auth';
import { asApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';

const PERSONAS = [
  { username: 'observer.gov', label: 'District observer', note: 'Regulator org. Reads trace and finance channels; never sees prices.' },
  { username: 'board.fpo', label: 'FPO board member', note: 'FPO org. Monitoring pages plus a link into the FPO console lot page.' },
];

/** Only same-site paths, so a crafted ?next= cannot send people elsewhere. */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export function LoginForm() {
  const { session, login, logout } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (session && (MONITOR_ROLES as readonly string[]).includes(session.user.role)) router.replace(next); }, [session, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const user = await login(username, password);
      if (!(MONITOR_ROLES as readonly string[]).includes(user.role)) { logout(); setError('That account is not an observer or board account. Use observer.gov or board.fpo.'); return; }
      router.replace(next);
    } catch (err) {
      const e2 = asApiError(err);
      setError(e2.code === 'ERR_UNAUTHENTICATED' ? (e2.serverMessage ?? e2.message) : e2.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_24rem]">
      <div>
        <PageHeader eyebrow="Governance dashboard" title="Is the FPO healthy, is distribution fair, and is the record trustworthy?">
          The monitoring pages are for the district observer and the FPO board. The ledger itself is public.
        </PageHeader>
        <div className="card p-5">
          <h2 className="text-base font-semibold">No sign-in needed to check a proof</h2>
          <p className="mt-1 text-ink-2">Every transaction, block and channel on the Fabric ledger can be opened by anyone with the link.</p>
          <Link href="/ledger" className="btn mt-4 no-underline" data-variant="primary">Open the Ledger Explorer <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </div>

      <form onSubmit={submit} className="card self-start p-5" aria-describedby={error ? 'login-error' : undefined}>
        <h2 className="text-base font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-ink-2">Demo logins. Password for all: <span className="mono">Setu@2026</span></p>
        <div className="mt-4 grid gap-2">
          {PERSONAS.map((p) => (
            <button type="button" key={p.username} className="btn !h-auto !items-start !justify-start !py-2 text-left"
              onClick={() => { setUsername(p.username); setPassword('Setu@2026'); }}>
              <span><span className="block mono">{p.username}</span><span className="block text-xs font-normal text-ink-2">{p.label}. {p.note}</span></span>
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium" htmlFor="u">Username</label>
        <input id="u" className="mt-1 min-h-11 w-full rounded-sm border border-line bg-surface px-3" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="mt-3 block text-sm font-medium" htmlFor="p">Password</label>
        <input id="p" type="password" className="mt-1 min-h-11 w-full rounded-sm border border-line bg-surface px-3" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p id="login-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <button className="btn mt-4 w-full" data-variant="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
