import { Suspense } from 'react';
import { Explorer } from './Explorer';

export const metadata = { title: 'Ledger Explorer' };

export default function LedgerPage() {
  return (
    <Suspense>
      <Explorer />
    </Suspense>
  );
}
