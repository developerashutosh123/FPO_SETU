import { LoanView } from './LoanView';

export async function generateMetadata({ params }: { params: Promise<{ loanId: string }> }) {
  return { title: (await params).loanId };
}
export default async function Page({ params }: { params: Promise<{ loanId: string }> }) {
  const { loanId } = await params;
  return <LoanView loanId={decodeURIComponent(loanId)} />;
}
