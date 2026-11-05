import Link from 'next/link';
import { StateShell } from '@/components/states';

export default function NotFound() {
  return <StateShell kind="notfound" title="This page does not exist" body="Check the link. Lot links look like /lots/<18-digit SSCC> and order links like /orders/<order ID>." action={<Link className="btn no-underline" href="/">Open the catalogue</Link>} />;
}
