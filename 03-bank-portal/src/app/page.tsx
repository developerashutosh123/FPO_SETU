import { redirect } from 'next/navigation';

// The portfolio overview is not built yet; the collateral search is the working front page.
export default function Home() {
  redirect('/collateral');
}
