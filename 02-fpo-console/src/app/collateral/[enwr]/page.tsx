import { CollateralView } from './CollateralView';

export default async function CollateralDetailPage({ params }: { params: Promise<{ enwr: string }> }) {
  const { enwr } = await params;
  return <CollateralView enwr={enwr} />;
}
