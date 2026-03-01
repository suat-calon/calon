import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title:       'Auralis Business OS',
  description: 'Güzellik ve wellness sektörü için Business OS',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
