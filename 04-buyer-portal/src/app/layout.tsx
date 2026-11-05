import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';

const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Sourcing catalogue · Gangetic Fresh Foods', template: '%s · Gangetic Fresh Foods' },
  description: 'Procurement portal of a fictional processor in the FPO-SETU academic prototype (RD61003, CRDIST, IIT Kharagpur, Group 7).',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-portal="buyer" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
