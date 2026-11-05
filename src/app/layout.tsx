import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, Newsreader } from 'next/font/google';
import type { ReactNode } from 'react';

import { strings } from '@/ui/strings';

import './globals.css';

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument-sans',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-newsreader',
});

export const metadata: Metadata = {
  title: strings.app.name,
  description: strings.app.description,
};

// The Viewport API needs a literal colour: keep in sync with `--color-bg` in globals.css.
export const viewport: Viewport = { themeColor: '#141619', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={`${instrumentSans.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
