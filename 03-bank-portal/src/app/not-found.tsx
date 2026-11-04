import Link from 'next/link';
import { StateShell } from '@/components/states';

export default function NotFound() {
  return <StateShell kind="notfound" title="This page does not exist" body="Check the link. Collateral links look like /collateral/<e-NWR> and loan links like /loans/<loan ID>." action={<Link className="btn no-underline" href="/collateral">Open collateral search</Link>} />;
}
