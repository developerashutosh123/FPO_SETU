import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, SearchX } from 'lucide-react';
import type { ApiClientError } from '@/lib/api';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function StateShell({ kind, title, body, action }: { kind: 'loading' | 'empty' | 'error' | 'notfound'; title: string; body?: string; action?: ReactNode }) {
  if (kind === 'loading') {
    return (
      <div className="card p-6" role="status" aria-live="polite" aria-label={title}>
        <span className="sr-only">{title}</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
    );
  }
  const Icon = kind === 'error' ? AlertTriangle : kind === 'notfound' ? SearchX : Inbox;
  return (
    <div className="card p-6 sm:p-8" role={kind === 'error' ? 'alert' : undefined}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${kind === 'error' ? 'text-danger' : 'text-ink-3'}`} aria-hidden />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {body && <p className="mt-1 max-w-prose text-ink-2">{body}</p>}
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, notFoundTitle }: { error: ApiClientError; onRetry?: () => void; notFoundTitle?: string }) {
  const nf = error.code === 'ERR_NOT_FOUND';
  return (
    <StateShell
      kind={nf ? 'notfound' : 'error'}
      title={nf ? (notFoundTitle ?? 'Not found') : 'Could not load this'}
      body={error.message}
      action={onRetry && !nf ? <button className="btn" onClick={onRetry}>Try again</button> : undefined}
    />
  );
}

/** Standard loading / error / data switch for useApi results. */
export function Boundary<T>({ state, children, skeleton, notFoundTitle }: {
  state: { data?: T; error?: ApiClientError; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode; skeleton?: ReactNode; notFoundTitle?: string;
}) {
  if (state.data !== undefined) return <>{children(state.data)}</>;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} notFoundTitle={notFoundTitle} />;
  return <>{skeleton ?? <StateShell kind="loading" title="Loading" />}</>;
}
