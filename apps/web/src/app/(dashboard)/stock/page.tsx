'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { localDb, LocalProduct, LocalStockMovement } from '../../../offline/db';
import { StockMovementModal } from '../../../components/stock/StockMovementModal';
import { PermissionGuard } from '../../../components/ui/PermissionGuard';

export default function StockDashboardPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const canRead = usePermissions('nexus:stock:read');
  const canWrite = usePermissions('nexus:stock:write');
  const canAdjust = usePermissions('nexus:stock:adjust');

  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LocalProduct | null>(null);
  const [actionType, setActionType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');

  useEffect(() => {
    const orgProducts = localDb.products.filter((p) => p.organizationId === orgId && p.type === 'PRODUCT');
    setProducts([...orgProducts]);
  }, [orgId]);

  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedStatus === 'LOW_STOCK') {
      result = result.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStockAlert);
    } else if (selectedStatus === 'OUT_OF_STOCK') {
      result = result.filter((p) => p.currentStock <= 0);
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;

    return result.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.reference.toLowerCase().includes(term)
    );
  }, [products, selectedStatus, searchTerm]);

  // Stock KPIs
  const totalStockables = products.length;
  const lowStockCount = useMemo(
    () => products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStockAlert).length,
    [products]
  );
  const outOfStockCount = useMemo(
    () => products.filter((p) => p.currentStock <= 0).length,
    [products]
  );

  const handleOpenModal = (prod: LocalProduct | null, action: 'IN' | 'OUT' | 'ADJUSTMENT') => {
    setSelectedProduct(prod);
    setActionType(action);
    setIsModalOpen(true);
  };

  const handleSaveMovement = async (data: {
    productId: string;
    actionType: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reason: string;
  }) => {
    const prodIdx = localDb.products.findIndex((p) => p.id === data.productId && p.organizationId === orgId);
    if (prodIdx === -1) return;

    const prod = localDb.products[prodIdx];
    let delta = 0;
    let movType: LocalStockMovement['type'] = 'IN';

    if (data.actionType === 'IN') {
      delta = data.quantity;
      movType = 'IN';
    } else if (data.actionType === 'OUT') {
      delta = -data.quantity;
      movType = 'OUT';
    } else if (data.actionType === 'ADJUSTMENT') {
      const diff = Number((data.quantity - prod.currentStock).toFixed(2));
      delta = diff;
      movType = diff >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    }

    const newStock = Number((prod.currentStock + delta).toFixed(2));
    if (newStock < 0) {
      alert(`Stock insuffisant ! Le stock actuel (${prod.currentStock}) ne permet pas de retirer la quantité demandée.`);
      return;
    }

    // Update product stock
    localDb.products[prodIdx].currentStock = newStock;

    // Create movement
    const newMovement: LocalStockMovement = {
      id: `mov-${crypto.randomUUID()}`,
      organizationId: orgId,
      productId: prod.id,
      type: movType,
      quantity: Math.abs(movType === 'ADJUSTMENT_IN' || movType === 'ADJUSTMENT_OUT' ? delta : data.quantity),
      unitCost: prod.purchaseCost,
      reason: data.reason || `Opération manuelle (${data.actionType})`,
      createdAt: new Date().toISOString(),
    };

    localDb.stockMovements.push(newMovement);

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'StockMovement',
      entityId: newMovement.id,
      operation: 'INSERT',
      payload: newMovement,
    });

    setProducts([...localDb.products.filter((p) => p.organizationId === orgId && p.type === 'PRODUCT')]);
    setIsModalOpen(false);
  };

  const getStockBadge = (prod: LocalProduct) => {
    if (prod.currentStock <= 0) {
      return { label: 'Rupture', bg: '#fef2f2', color: '#dc2626' };
    }
    if (prod.currentStock <= prod.minStockAlert) {
      return { label: 'Alerte Stock', bg: '#fef3c7', color: '#b45309' };
    }
    return { label: 'En Stock', bg: '#dcfce7', color: '#15803d' };
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
              État du Stock & Inventaire
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Suivi en temps réel des quantités disponibles et des seuils d'alerte pour{' '}
              <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {canWrite && (
              <button
                onClick={() => handleOpenModal(null, 'IN')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ➕ Entrée Stock
              </button>
            )}

            {canAdjust && (
              <button
                onClick={() => handleOpenModal(null, 'ADJUSTMENT')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ⚖️ Ajustement Inventaire
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Articles Stockables</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {totalStockables}
            </div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Alerte Stock Faible</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
              {lowStockCount}
            </div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Ruptures de Stock</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
              {outOfStockCount}
            </div>
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
            placeholder="Rechercher un produit par référence SKU ou désignation..."
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
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">Tous les Niveaux de Stock</option>
            <option value="LOW_STOCK">Seuil d'Alerte Atteint</option>
            <option value="OUT_OF_STOCK">Ruptures de Stock</option>
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
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>RÉFÉRENCE (SKU)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>PRODUIT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>STATUT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>SEUIL ALERTE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>STOCK DISPONIBLE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Aucun produit stockable trouvé.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod) => {
                  const badge = getStockBadge(prod);

                  return (
                    <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        <code>{prod.reference}</code>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{prod.name}</div>
                        {prod.description && (
                          <div style={{ fontSize: 12, color: '#64748b' }}>{prod.description}</div>
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
                      <td style={{ padding: '14px 16px', color: '#64748b' }}>
                        {prod.minStockAlert} {prod.unit}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0f172a', fontSize: 15 }}>
                        {prod.currentStock} {prod.unit}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          {canWrite && (
                            <button
                              onClick={() => handleOpenModal(prod, 'IN')}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#f0fdf4',
                                color: '#15803d',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              + Entrée
                            </button>
                          )}

                          {canWrite && (
                            <button
                              onClick={() => handleOpenModal(prod, 'OUT')}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              - Sortie
                            </button>
                          )}

                          {canAdjust && (
                            <button
                              onClick={() => handleOpenModal(prod, 'ADJUSTMENT')}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              ⚖️ Ajuster
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        <StockMovementModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveMovement}
          products={products}
          selectedProduct={selectedProduct}
          initialAction={actionType}
        />
      </div>
    </PermissionGuard>
  );
}
