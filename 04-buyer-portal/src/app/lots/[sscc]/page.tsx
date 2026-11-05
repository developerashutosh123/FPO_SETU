import { LotSpec } from './LotSpec';

export async function generateMetadata({ params }: { params: Promise<{ sscc: string }> }) {
  return { title: `Lot ${(await params).sscc}` };
}
export default async function Page({ params }: { params: Promise<{ sscc: string }> }) {
  const { sscc } = await params;
  return <LotSpec sscc={decodeURIComponent(sscc)} />;
}
