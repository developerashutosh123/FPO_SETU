'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, FileCheck2, XCircle } from 'lucide-react';
import { sha256Hex } from '@/lib/hash';

type Result = { name: string; computed: string; match: boolean } | { error: string };

/**
 * "Re-verify" (contract 9.3 item 1). The gateway has no endpoint that serves document bytes, so the buyer picks the copy they hold
 * (for example the weighbridge slip that came with the consignment). The browser hashes it with Web Crypto and compares it with the
 * SHA-256 the ledger recorded. The file never leaves the browser.
 */
export function Reverify({ docName, onChainSha256 }: { docName: string; onChainSha256: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const computed = await sha256Hex(await file.arrayBuffer());
      setResult({ name: file.name, computed, match: computed === onChainSha256.toLowerCase() });
    } catch {
      setResult({ error: 'The browser could not read or hash that file. Try again, or pick a smaller file.' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="mt-2">
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="reverify-input" />
      <button type="button" className="btn !min-h-8 !px-2.5" disabled={busy} onClick={() => input.current?.click()} data-testid="reverify" aria-label={`Re-verify ${docName}: choose your copy of the file`}>
        <FileCheck2 className="h-4 w-4" aria-hidden />{busy ? 'Hashing…' : 'Re-verify'}
      </button>
      {result && 'error' in result && <p className="mt-2 text-sm text-danger" role="alert">{result.error}</p>}
      {result && 'computed' in result && (
        <div className="mt-2 text-sm" role="status" data-testid="reverify-result" data-match={result.match}>
          <p className={`flex items-center gap-1.5 font-semibold ${result.match ? 'text-ok' : 'text-danger'}`}>
            {result.match ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
            {result.match ? 'Match: this file is the one the ledger recorded.' : 'Mismatch: this file is not the one the ledger recorded.'}
          </p>
          <dl className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[7rem_1fr]">
            <dt className="text-ink-2">Your file</dt><dd className="mono break-all" data-testid="computed-hash">{result.computed}</dd>
            <dt className="text-ink-2">On the ledger</dt><dd className="mono break-all">{onChainSha256}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
