import Link from 'next/link';
import { StateShell } from '@/components/states';

export default function NotFound() {
  return <StateShell kind="notfound" title="This page does not exist" body="Check the link. Lot links look like /lots/<SSCC>, order links /orders/<order ID> and collateral links /collateral/<e-NWR>." action={<Link className="btn no-underline" href="/">Open Today</Link>} />;
}
