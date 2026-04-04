import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DisplaySettingsProvider } from '@/components/providers/display-settings-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { SessionProvider } from '@/components/providers/session-provider';

export const metadata: Metadata = {
  title: 'Cotizaciones 360',
  description: 'Sistema empresarial de gestión de cotizaciones',
  icons: {
    icon: '/brand/logo.png',
    shortcut: '/brand/logo.png',
    apple: '/brand/logo.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>
          <SessionProvider>
            <DisplaySettingsProvider>{children}</DisplaySettingsProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
