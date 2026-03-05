import type { Metadata } from 'next';
import './globals.css';
import { Toaster }       from '@/components/ui/toaster';
import { QueryProvider } from '@/components/providers/query-provider';

export const metadata: Metadata = {
  title:       'Calon — Salon Operating System',
  description: 'Güzellik ve wellness sektörü için Salon Operating System',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
