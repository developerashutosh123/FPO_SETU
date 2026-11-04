import Link from 'next/link';
import { StateShell } from '@/components/states';

export default function TxNotFound() {
  return (
    <StateShell kind="notfound" title="No transaction with this ID"
      body="The ledger index has no transaction under this ID. Check the link for a cut-off or mistyped character, or search by lot, e-NWR or order ID."
      action={<Link className="btn no-underline" href="/ledger">Search the ledger</Link>} />
  );
}
