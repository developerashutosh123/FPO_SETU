import { Suspense } from 'react';
import { Receive } from './Receive';

export const metadata = { title: 'Receive shipment' };
export default function Page() {
  return (
    <Suspense>
      <Receive />
    </Suspense>
  );
}
