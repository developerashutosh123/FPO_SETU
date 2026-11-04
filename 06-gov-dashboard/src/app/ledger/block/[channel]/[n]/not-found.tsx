import Link from 'next/link';
import { StateShell } from '@/components/states';

export default function BlockNotFound() {
  return (
    <StateShell kind="notfound" title="No such block"
      body="A block link looks like /ledger/block/trace-channel/1189. The index may not have this block yet, or the number is beyond the channel height."
      action={<Link className="btn no-underline" href="/ledger">Open the Ledger Explorer</Link>} />
  );
}
