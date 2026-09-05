'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { localDb, LocalStockMovement, LocalProduct } from '../../../../offline/db';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';

export default function StockMovementsPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const [movements, setMovements] = useState<LocalStockMovement[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  useEffect(() => {
    const orgMovements = localDb.stockMovements.filter((m) => m.organizationId === orgId);
    const orgProducts = localDb.products.filter((p) => p.organizationId === orgId);

    setMovements([...orgMovements]);
    setProducts([...orgProducts]);
  }, [orgId]);

  const productMap = useMemo(() => {
    const map = new Map<string, LocalProduct>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const filteredMovements = useMemo(() => {
    let result = movements;

    if (selectedType !== 'ALL') {
      result = result.filter((m) => m.type === selectedType);
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;

    return result.filter((m) => {
      const prod = productMap.get(m.productId);
      const name = prod ? prod.name.toLowerCase() : '';
      const ref = prod ? prod.reference.toLowerCase() : '';
      const reason = (m.reason || '').toLowerCase();
      const doc = (m.referenceDocId || '').toLowerCase();

      return name.includes(term) || ref.includes(term) || reason.includes(term) || doc.includes(term);
    });
  }, [movements, selectedType, searchTerm, productMap]);

  const getTypeBadge = (type: LocalStockMovement['type']) => {
    switch (type) {
      case 'IN':
        return { label: 'Entrée (+)', bg: '#dcfce7', color: '#15803d' };
      case 'OUT':
        return { label: 'Sortie (-)', bg: '#fef2f2', color: '#dc2626' };
      case 'ADJUSTMENT_IN':
        return { label: 'Ajustement (+)', bg: '#e0f2fe', color: '#0369a1' };
      case 'ADJUSTMENT_OUT':
        return { label: 'Ajustement (-)', bg: '#ffedd5', color: '#c2410c' };
      default:
        return { label: type, bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <PermissionGuard permission="nexus:stock:read">
      <div>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
              Historique des Mouvements de Stock
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Journal immuable de toutes les entrées, sorties et ajustements de stock pour{' '}
              <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
            </p>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            marginBottom: 20,
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            placeholder="Rechercher par produit, SKU, motif ou document..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: 280,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
            }}
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">Tous les Types de Mouvements</option>
            <option value="IN">Entrées (+)</option>
            <option value="OUT">Sorties (-)</option>
            <option value="ADJUSTMENT_IN">Ajustements Positifs (+)</option>
            <option value="ADJUSTMENT_OUT">Ajustements Négatifs (-)</option>
          </select>
        </div>

        {/* Table */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>DATE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>PRODUIT (SKU)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>TYPE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>MOTIF</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>DOCUMENT SOURCE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>QUANTITÉ</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Aucun mouvement de stock enregistré.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((mov) => {
                  const prod = productMap.get(mov.productId);
                  const badge = getTypeBadge(mov.type);
                  const isPositive = mov.type === 'IN' || mov.type === 'ADJUSTMENT_IN';

                  return (
                    <tr key={mov.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {new Date(mov.createdAt).toLocaleString('fr-FR')}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{prod ? prod.name : 'Produit Inconnu'}</div>
                        {prod && (
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            <code>{prod.reference}</code>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#334155' }}>
                        {mov.reason || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#0284c7', fontWeight: 600 }}>
                        {mov.referenceDocId ? <code>{mov.referenceDocId}</code> : '—'}
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          textAlign: 'right',
                          fontWeight: 800,
                          fontSize: 15,
                          color: isPositive ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {isPositive ? `+${mov.quantity}` : `-${mov.quantity}`} {prod?.unit || 'PCE'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PermissionGuard>
  );
}
