'use client';

import React from 'react';
import Link from 'next/link';

export default function VitalisDashboardPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 600,
          textAlign: 'center',
          backgroundColor: '#1e293b',
          padding: 40,
          borderRadius: 16,
          border: '1px solid #334155',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }}>🩺</div>
        <h1 style={{ margin: '0 0 12px 0', fontSize: 28, fontWeight: 800, color: '#4ade80' }}>
          NEXORA VITALIS
        </h1>
        <p style={{ margin: '0 0 24px 0', fontSize: 16, color: '#94a3b8', lineHeight: 1.6 }}>
          Module de Gestion de Santé. Ce module est connecté à l'infrastructure centrale <strong>NEXORA CORE</strong> (Authentification, Sécurité, RBAC & Synchronisation).
        </p>

        <div
          style={{
            padding: 16,
            backgroundColor: '#0f172a',
            borderRadius: 8,
            border: '1px solid #1e293b',
            marginBottom: 32,
            fontSize: 14,
            color: '#cbd5e1',
          }}
        >
          🚀 Le développement prioritaire est actuellement concentré sur <strong>NEXORA NEXUS</strong>.
        </div>

        <Link
          href="/select-module"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          ← Retourner à NEXORA CORE / Changer de module
        </Link>
      </div>
    </div>
  );
}
