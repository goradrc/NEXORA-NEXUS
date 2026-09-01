'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PermissionGuard } from '../ui/PermissionGuard';

export interface SidebarNavGroup {
  title: string;
  items: Array<{
    label: string;
    href: string;
    icon: string;
    permission?: string;
  }>;
}

const navGroups: SidebarNavGroup[] = [
  {
    title: 'Vue d\'ensemble',
    items: [{ label: 'Tableau de bord', href: '/', icon: '📊' }],
  },
  {
    title: 'Ventes & Commercial',
    items: [
      { label: 'Clients CRM', href: '/customers', icon: '👥', permission: 'nexus:customers:read' },
      { label: 'Devis & Proformas', href: '/sales/quotes', icon: '📝', permission: 'nexus:quotes:read' },
      { label: 'Factures de Vente', href: '/sales/invoices', icon: '📄', permission: 'nexus:invoices:read' },
      { label: 'Encaissements', href: '/sales/payments', icon: '💳', permission: 'nexus:payments:read' },
    ],
  },
  {
    title: 'Catalogue & Opérations',
    items: [
      { label: 'Produits & Services', href: '/catalog', icon: '📦', permission: 'nexus:catalog:read' },
      { label: 'Mouvements Stock', href: '/stock', icon: '🔄', permission: 'nexus:stock:read' },
      { label: 'Dépenses', href: '/expenses', icon: '💸', permission: 'nexus:expenses:read' },
      { label: 'Personnel & RH', href: '/employees', icon: '👤', permission: 'nexus:employees:read' },
    ],
  },
  {
    title: 'Pilotage & Config',
    items: [
      { label: 'Finances & Bilan', href: '/finance', icon: '📈' },
      { label: 'Rapports', href: '/reports', icon: '📋' },
      { label: 'Paramètres Entreprise', href: '/settings', icon: '⚙️' },
    ],
  },
];

export const Sidebar: React.FC<{ isOpen?: boolean }> = ({ isOpen = true }) => {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <aside
      style={{
        width: 250,
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid #1e293b',
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: 0.5,
          color: '#38bdf8',
        }}
      >
        NEXORA NEXUS
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        {navGroups.map((group, idx) => (
          <div key={idx} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: '#64748b',
                padding: '0 12px 8px 12px',
                letterSpacing: 1,
              }}
            >
              {group.title}
            </div>

            {group.items.map((item, itemIdx) => {
              const isActive = pathname === item.href;
              const linkContent = (
                <Link
                  key={itemIdx}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#ffffff' : '#94a3b8',
                    backgroundColor: isActive ? '#0284c7' : 'transparent',
                    textDecoration: 'none',
                    marginBottom: 4,
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );

              if (item.permission) {
                return (
                  <PermissionGuard key={itemIdx} permission={item.permission}>
                    {linkContent}
                  </PermissionGuard>
                );
              }

              return linkContent;
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};
