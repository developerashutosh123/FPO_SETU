import { Suspense } from 'react';
import { LotsView } from './LotsView';

export const metadata = { title: 'Lots' };

export default function LotsPage() {
  return <Suspense><LotsView /></Suspense>;
}
