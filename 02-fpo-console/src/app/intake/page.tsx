import { Suspense } from 'react';
import { IntakeView } from './IntakeView';

export const metadata = { title: 'Intake' };

export default function IntakePage() {
  return <Suspense><IntakeView /></Suspense>;
}
