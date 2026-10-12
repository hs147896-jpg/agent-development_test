'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BackupDialog } from './BackupDialog';

const links = [
  { href: '/', label: '실적·손익' },
  { href: '/menus', label: '메뉴 수익성' },
  { href: '/inventory', label: '재료·재고' },
  { href: '/records', label: '기록 관리' },
];

export function AppShell({ children }) {
  const pathname = usePathname();
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="프렙 카페 운영 홈">
          <span className="brand-mark" />
          <span>프렙 카페 운영</span>
          <small>매장 관리 시스템</small>
        </Link>
        <nav aria-label="주요 화면">
          {links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? 'active' : ''}>{link.label}</Link>)}
        </nav>
        <div className="header-actions"><BackupDialog /><div className="epic-chip">EPIC 3</div></div>
      </header>
      <main className="page-shell">{children}</main>
      <footer className="footer">프렙 카페 운영 · 브라우저 내부 저장 · 가상 매장 샘플</footer>
    </>
  );
}
