'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Link2, ArrowLeftRight, EyeOff } from 'lucide-react';
import { useAuth, isCreditOfficer } from '@/lib/auth';
import { asApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const POINTS = [
  { icon: BadgeCheck, text: 'Ledger-verified collateral' },
  { icon: Link2, text: 'One lien per e-NWR — no double financing' },
  { icon: ArrowLeftRight, text: 'Disburse / repay / release' },
  { icon: EyeOff, text: 'Lender never sees PII' },
];

function ChainMotif() {
  return (
    <svg aria-hidden className="login-motif" viewBox="0 0 340 110" fill="none" stroke="currentColor" strokeWidth="1.5">
      {[8, 98, 188, 278].map((x) => (<g key={x}><rect x={x} y="28" width="54" height="54" rx="10" /><path d={`M${x + 12} 46h30M${x + 12} 56h22M${x + 12} 66h28`} strokeLinecap="round" /></g>))}
      {[62, 152, 242].map((x) => (<path key={x} d={`M${x} 55h36`} strokeDasharray="3 4" />))}
    </svg>
  );
}

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
    <div className="login-wrap">
      <div className="login-hero">
        <ChainMotif />
        <PageHeader eyebrow="Credit officer console" title="Is this collateral real, and is it already pledged?">
        Search an e-NWR, read the valuation and the ledger&apos;s lien status, then mark a lien. The ledger refuses a second lien on the same receipt.
        </PageHeader>
        <ul className="login-points">
          {POINTS.map(({ icon: Icon, text }) => (<li key={text} className="login-point"><Icon aria-hidden />{text}</li>))}
        </ul>
      </div>
      <form onSubmit={submit} className="card self-start p-5" aria-describedby={error ? 'login-error' : undefined}>
        <h2 className="text-base font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-ink-2">Demo login. Password: <span className="mono">Setu@2026</span></p>
        <Button variant="outline" className="mt-4 w-full text-left" type="button"  onClick={() => { setUsername('arindam.bank'); setPassword('Setu@2026'); }}>
          <span><span className="block mono">arindam.bank</span><span className="block text-xs font-normal text-ink-2">Arindam Ghosh, branch credit officer (BankOrgMSP)</span></span>
        </Button>
        <label className="mt-4 block text-sm font-medium" htmlFor="u">Username</label>
        <Input id="u" className="mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="mt-3 block text-sm font-medium" htmlFor="p">Password</label>
        <input id="p" type="password" className="field mt-1" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p id="login-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <Button className="mt-4 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
