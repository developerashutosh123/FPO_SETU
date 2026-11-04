import { CollateralView } from './CollateralView';

export async function generateMetadata({ params }: { params: Promise<{ enwr: string }> }) {
  return { title: (await params).enwr };
}
export default async function Page({ params }: { params: Promise<{ enwr: string }> }) {
  const { enwr } = await params;
  return <CollateralView enwr={decodeURIComponent(enwr)} />;
}
