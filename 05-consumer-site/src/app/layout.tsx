import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-plex-mono', display: 'swap' });
const bengali = Noto_Sans_Bengali({ subsets: ['bengali'], weight: ['400', '600'], variable: '--font-bn-loaded', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: { default: 'FPO-SETU: where your food came from', template: '%s · FPO-SETU' },
  description: 'Scan the code on a pack to see where the produce was grown, how it was handled, and the proof each party signed. Academic prototype (RD61003, CRDIST, IIT Kharagpur, Group 7).',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-portal="consumer" className={`${sans.variable} ${mono.variable} ${bengali.variable}`}>
      <body>{children}</body>
    </html>
  );
}
