'use client';

import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function DashboardHomePage() {
  const { activeOrganization } = useAuth();

  const kpis = [
    { label: 'Chiffre d\'Affaires (Mois)', value: '24 850,00 €', change: '+12%', color: '#0284c7' },
    { label: 'Encaissements Reçus', value: '18 400,00 €', change: '+8%', color: '#16a34a' },
    { label: 'Créances Clients à Recouvrer', value: '6 450,00 €', change: '3 factures', color: '#d97706' },
    { label: 'Dépenses du Mois', value: '4 120,00 €', change: '-5%', color: '#dc2626' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
          Tableau de Bord Principal
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
          Vue synthétique de l'activité pour : <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          marginBottom: 32,
        }}
      >
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            style={{
              padding: 20,
              backgroundColor: '#ffffff',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, marginBottom: 4 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
              {kpi.change} par rapport au mois dernier
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 24,
          backgroundColor: '#ffffff',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
          🚀 Bienvenue sur NEXORA NEXUS
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
          L'architecture du frontend Web Next.js est en place. Elle intègre le Header responsive, le sélecteur d'entreprise multi-tenant, la Sidebar de navigation, l'indicateur de réseau hors-ligne / Sync Queue, la gestion de session JWT et le contrôle d'accès RBAC.
        </p>
      </div>
    </div>
  );
}
