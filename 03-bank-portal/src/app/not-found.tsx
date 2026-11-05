import Link from 'next/link';
import { StateShell } from '@/components/states';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <StateShell kind="notfound" title="This page does not exist" body="Check the link. Collateral links look like /collateral/<e-NWR> and loan links like /loans/<loan ID>." action={<Button asChild variant="outline"><Link href="/collateral">Open collateral search</Link></Button>} />;
}
