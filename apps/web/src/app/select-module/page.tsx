'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, ModuleType } from '../../context/AuthContext';

export default function SelectModulePage() {
  const { user, activeModule, selectModule } = useAuth();
  const router = useRouter();
  const [saveAsDefault, setSaveAsDefault] = useState(true);

  const handleChooseModule = (module: ModuleType) => {
    selectModule(module, saveAsDefault);
    if (module === 'NEXUS') {
      router.push('/');
    } else if (module === 'VITALIS') {
      router.push('/vitalis');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        fontFamily: 'sans-serif',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#38bdf8', letterSpacing: 1 }}>
          NEXORA CORE
        </h1>
        <p style={{ margin: '8px 0 0 0', fontSize: 16, color: '#94a3b8' }}>
          Plateforme Modulaire Multi-Tenant — Choisissez votre espace de travail
        </p>
        {user && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
            Connecté en tant que : <strong style={{ color: '#cbd5e1' }}>{user.email}</strong>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 24,
          maxWidth: 800,
          width: '100%',
          marginBottom: 32,
        }}
      >
        {/* Card NEXORA NEXUS */}
        <div
          onClick={() => handleChooseModule('NEXUS')}
          style={{
            padding: 32,
            backgroundColor: '#1e293b',
            borderRadius: 16,
            border: activeModule === 'NEXUS' ? '2px solid #0284c7' : '1px solid #334155',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
          }}
        >
          {activeModule === 'NEXUS' && (
            <span
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                backgroundColor: '#0284c7',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 12,
              }}
            >
              MODULE ACTIF
            </span>
          )}
          <div style={{ fontSize: 40, marginBottom: 16 }}>💼</div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
            NEXORA NEXUS
          </h2>
          <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
            Gestion d'Entreprise & ERP Complet : Clients CRM, Fournisseurs, Catalogues, Stocks, Devis, Facturation, Encaissements & Finances.
          </p>
          <button
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Accéder à NEXORA NEXUS →
          </button>
        </div>

        {/* Card NEXORA VITALIS */}
        <div
          onClick={() => handleChooseModule('VITALIS')}
          style={{
            padding: 32,
            backgroundColor: '#1e293b',
            borderRadius: 16,
            border: activeModule === 'VITALIS' ? '2px solid #16a34a' : '1px solid #334155',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
          }}
        >
          {activeModule === 'VITALIS' && (
            <span
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                backgroundColor: '#16a34a',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 12,
              }}
            >
              MODULE ACTIF
            </span>
          )}
          <div style={{ fontSize: 40, marginBottom: 16 }}>🩺</div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
            NEXORA VITALIS
          </h2>
          <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>
            Gestion de Santé & Établissements Médicaux : Patients, Rendez-vous, Dossiers Médicaux, Consultations & Prescriptions.
          </p>
          <button
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#16a34a',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Accéder à NEXORA VITALIS →
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 14 }}>
        <input
          type="checkbox"
          id="saveDefault"
          checked={saveAsDefault}
          onChange={(e) => setSaveAsDefault(e.target.checked)}
          style={{ width: 18, height: 18, cursor: 'pointer' }}
        />
        <label htmlFor="saveDefault" style={{ cursor: 'pointer', userSelect: 'none' }}>
          Mémoriser mon choix comme module par défaut aux prochaines connexions
        </label>
      </div>
    </div>
  );
}
