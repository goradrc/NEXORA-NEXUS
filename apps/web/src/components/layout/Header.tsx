'use client';

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { NetworkStatusBadge } from '../offline/NetworkStatusBadge';

export const Header: React.FC<{ onToggleSidebar?: () => void }> = ({ onToggleSidebar }) => {
  const { user, activeOrganization, organizations, switchOrganization, logout } = useAuth();

  return (
    <header
      style={{
        height: 64,
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            padding: 8,
          }}
          aria-label="Toggle Sidebar"
        >
          ☰
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Entreprise :</span>
          <select
            value={activeOrganization?.id || ''}
            onChange={e => switchOrganization(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              fontSize: 14,
              fontWeight: 600,
              color: '#0f172a',
            }}
          >
            {organizations.map(org => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <NetworkStatusBadge />

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>{user.email}</span>
            <button
              onClick={logout}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #f87171',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Déconnexion
            </button>
          </div>
        ) : (
          <a
            href="/login"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#2563eb',
              textDecoration: 'none',
            }}
          >
            Se connecter
          </a>
        )}
      </div>
    </header>
  );
};
