import './globals.css';
import { AppShell } from '@/components/AppShell';
import { DataProvider } from '@/components/DataProvider';

export const metadata = {
  title: '프렙 카페 운영',
  description: '판매·손익·메뉴 수익성·재고 현황 관리',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
