'use client';
import { use } from 'react';
import { RequireAuth } from '@/lib/auth';
import { LotView } from './LotView';

export default function LotPage({ params }: { params: Promise<{ sscc: string }> }) {
  const { sscc } = use(params);
  return <RequireAuth>{(user) => <LotView sscc={decodeURIComponent(sscc)} role={user.role} />}</RequireAuth>;
}
