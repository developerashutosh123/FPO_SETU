'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boxes, Handshake, FileCheck2, ScrollText } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { asApiError } from '@/lib/api';
import { isFpoRole } from '@/lib/access';
import { PageHeader } from '@/components/ui';

const POINTS = [
  { icon: Boxes, text: 'Intake · grade · dispatch' },
  { icon: Handshake, text: 'Sealed two-party price' },
  { icon: FileCheck2, text: 'Collateral & liens at a glance' },
  { icon: ScrollText, text: 'Every change is an auditable transaction' },
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
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

const ACCOUNTS = [
  { username: 'sujata.ceo', who: 'Sujata Jana, CEO', sees: 'Orders, collateral, price agreement, settlement' },
  { username: 'debasis.ops', who: 'Debasis Mondal, operator', sees: 'Intake, grading, labels, dispatch' },
  { username: 'ratan.store', who: 'Ratan Pal, cold-storage clerk', sees: 'Lots and storage status' },
  { username: 'subhankar.vle', who: 'Subhankar Maity, VLE', sees: 'Lots at the Changual centre' },
];

export function LoginForm() {
  const { session, login, logout } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (session && isFpoRole(session.user.role)) router.replace(next); }, [session, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const user = await login(username, password);
      if (!isFpoRole(user.role)) { logout(); setError('That account is not part of the FPO team.'); return; }
      router.replace(next);
    } catch (err) {
      const e2 = asApiError(err);
      setError(e2.code === 'ERR_UNAUTHENTICATED' || e2.code === 'ERR_FORBIDDEN_ROLE' ? (e2.serverMessage ?? e2.message) : e2.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap" style={{ '--login-card': '26rem' } as React.CSSProperties}>
      <div className="login-hero">
        <ChainMotif />
        <PageHeader eyebrow="Kharagpur Krishak Sanghati Producer Company Ltd · FPO07" title="What is in the centre right now, and what should move today?">
        Weigh and grade incoming lots, agree prices with the buyer, dispatch, and see which lots a bank holds a lien on. Every change you make is a transaction the bank, the buyer and the observer can check.
        </PageHeader>
        <ul className="login-points">
          {POINTS.map(({ icon: Icon, text }) => (<li key={text} className="login-point"><Icon aria-hidden />{text}</li>))}
        </ul>
      </div>
      <form onSubmit={submit} className="card self-start p-5" aria-describedby={error ? 'login-error' : undefined}>
        <h2 className="text-base font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-ink-2">Demo logins. Password: <span className="mono">Setu@2026</span></p>
        <div className="mt-3 grid gap-2">
          {ACCOUNTS.map((a) => (
            <button key={a.username} type="button" className="btn !h-auto !items-start !justify-start !py-2 text-left" onClick={() => { setUsername(a.username); setPassword('Setu@2026'); }}>
              <span><span className="block mono">{a.username}</span><span className="block text-xs font-normal text-ink-2">{a.who}. {a.sees}.</span></span>
            </button>
          ))}
        </div>
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
