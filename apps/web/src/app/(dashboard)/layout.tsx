'use client';

import React, { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Sidebar } from '../../components/layout/Sidebar';
import { useAuth } from '../../context/AuthContext';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { isAuthenticated, loading, activeOrganization, user, error } = useAuth();
  const pathname = usePathname();
  const pendingSales = ['/sales/quotes', '/sales/invoices', '/sales/payments'].includes(pathname);
  if (loading) return <p role="status">Chargement de votre session…</p>;
  if (!isAuthenticated) return <p>Connectez-vous pour accéder à votre entreprise. <a href="/login">Se connecter</a></p>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar isOpen={sidebarOpen} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        {error && <p role="alert">{error}</p>}
        <main key={activeOrganization?.id + ':' + user?.permissions.slice().sort().join(',')} style={{ flex: 1, padding: 24, overflowY: 'auto' }}>{pendingSales ? <p>Ce module n’est pas encore disponible. <a href="/sales/delivery-notes">Consulter les bons de livraison</a></p> : children}</main>
      </div>
    </div>
  );
}
