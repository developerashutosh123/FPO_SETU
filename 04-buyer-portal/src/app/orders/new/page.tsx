import { Suspense } from 'react';
import { NewOrder } from './NewOrder';

export const metadata = { title: 'New order' };
export default function Page() {
  return (
    <Suspense>
      <NewOrder />
    </Suspense>
  );
}
