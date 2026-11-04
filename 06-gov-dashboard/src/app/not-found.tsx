import Link from 'next/link';
import { StateShell } from '@/components/states';

export default function NotFound() {
  return <StateShell kind="notfound" title="This page does not exist" body="Check the link. Proof links look like /ledger/tx/<transaction ID>, /ledger/block/<channel>/<number> or /lots/<SSCC>." action={<Link className="btn no-underline" href="/ledger">Open the Ledger Explorer</Link>} />;
}
