import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Aruna — Live Streaming',
  description: 'Scalable live streaming platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:8080';

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClerkProvider
          signInFallbackRedirectUrl={appUrl}
          signUpFallbackRedirectUrl={appUrl}
          signInForceRedirectUrl={appUrl}
          signUpForceRedirectUrl={appUrl}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
