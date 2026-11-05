import { LotView } from './LotView';

export default async function LotPage({ params }: { params: Promise<{ sscc: string }> }) {
  const { sscc } = await params;
  return <LotView sscc={sscc} />;
}
