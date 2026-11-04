'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, isCreditOfficer } from '@/lib/auth';
import { asApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';

/** Only same-site paths, so a crafted ?next= cannot send people elsewhere. */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/collateral');

export function LoginForm() {
  const { session, login, logout } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (session && isCreditOfficer(session.user)) router.replace(next); }, [session, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const user = await login(username, password);
      if (!isCreditOfficer(user)) { logout(); setError('That account is not a credit officer. Use arindam.bank.'); return; }
      router.replace(next);
    } catch (err) {
      const e2 = asApiError(err);
      setError(e2.code === 'ERR_UNAUTHENTICATED' || e2.code === 'ERR_FORBIDDEN_ROLE' ? (e2.serverMessage ?? e2.message) : e2.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_24rem]">
      <PageHeader eyebrow="Credit officer console" title="Is this collateral real, and is it already pledged?">
        Search an e-NWR, read the valuation and the ledger&apos;s lien status, then mark a lien. The ledger refuses a second lien on the same receipt.
      </PageHeader>
      <form onSubmit={submit} className="card self-start p-5" aria-describedby={error ? 'login-error' : undefined}>
        <h2 className="text-base font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-ink-2">Demo login. Password: <span className="mono">Setu@2026</span></p>
        <button type="button" className="btn mt-4 w-full !h-auto !items-start !justify-start !py-2 text-left" onClick={() => { setUsername('arindam.bank'); setPassword('Setu@2026'); }}>
          <span><span className="block mono">arindam.bank</span><span className="block text-xs font-normal text-ink-2">Arindam Ghosh, branch credit officer (BankOrgMSP)</span></span>
        </button>
        <label className="mt-4 block text-sm font-medium" htmlFor="u">Username</label>
        <input id="u" className="field mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="mt-3 block text-sm font-medium" htmlFor="p">Password</label>
        <input id="p" type="password" className="field mt-1" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p id="login-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <button className="btn mt-4 w-full" data-variant="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
