'use client';

import React, { useState, useEffect } from 'react';
import {
  PurchaseOrderDto,
  SupplierDto,
  ProductServiceDto,
  CreatePurchaseOrderDto,
  POStatus,
} from '@nexora/nexus';
import { ApiClient } from '../../../services/api-client';
import { PermissionGuard } from '../../../components/ui/PermissionGuard';
import { PurchaseOrderModal } from '../../../components/purchases/PurchaseOrderModal';

const STATUS_CONFIG: Record<
  POStatus,
  { label: string; bg: string; color: string; border: string }
> = {
  DRAFT: { label: 'Brouillon', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  ORDERED: { label: 'Commandée', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  RECEIVED: { label: 'Réceptionnée', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  CANCELLED: { label: 'Annulée', bg: '#ffe4e6', color: '#be123c', border: '#fecdd3' },
};

const DEFAULT_SUPPLIERS: SupplierDto[] = [
  {
    id: 'supp-1',
    organizationId: 'org-1',
    code: 'FOURN-001',
    name: 'Tech Hardware Supplier',
    balanceDue: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'supp-2',
    organizationId: 'org-1',
    code: 'FOURN-002',
    name: 'Logistics & Supply Co',
    balanceDue: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_CATALOG: ProductServiceDto[] = [
  {
    id: 'prod-1',
    organizationId: 'org-1',
    categoryId: 'cat-1',
    type: 'PRODUCT',
    reference: 'SKU-PO-01',
    name: 'Workstation Laptop',
    salePrice: 1200,
    purchaseCost: 800,
    taxRate: 20,
    currentStock: 10,
    minStockAlert: 2,
  },
  {
    id: 'prod-2',
    organizationId: 'org-1',
    categoryId: 'cat-2',
    type: 'SERVICE',
    reference: 'SKU-SRV-01',
    name: 'Installation Service',
    salePrice: 150,
    purchaseCost: 100,
    taxRate: 0,
    currentStock: 0,
    minStockAlert: 0,
  },
];

export default function PurchasesPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderDto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>(DEFAULT_SUPPLIERS);
  const [catalogItems, setCatalogItems] = useState<ProductServiceDto[]>(DEFAULT_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrderDto | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'ORDER' | 'RECEIVE' | 'CANCEL' | null;
    po: PurchaseOrderDto | null;
  }>({
    isOpen: false,
    action: null,
    po: null,
  });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [posRes, suppRes, catRes] = await Promise.all([
        ApiClient.request<PurchaseOrderDto[]>('/nexus/purchase-orders'),
        ApiClient.request<SupplierDto[]>('/nexus/suppliers'),
        ApiClient.request<ProductServiceDto[]>('/nexus/catalog'),
      ]);

      if (posRes.data && Array.isArray(posRes.data)) {
        setPurchaseOrders(posRes.data);
      }
      if (suppRes.data && Array.isArray(suppRes.data) && suppRes.data.length > 0) {
        setSuppliers(suppRes.data);
      }
      if (catRes.data && Array.isArray(catRes.data) && catRes.data.length > 0) {
        setCatalogItems(catRes.data);
      }
    } catch (err: any) {
      // Keep fallbacks in dev mode
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save handler
  const handleSavePO = async (dto: CreatePurchaseOrderDto) => {
    try {
      if (editingPO) {
        const res = await ApiClient.request<PurchaseOrderDto>(
          `/nexus/purchase-orders/${editingPO.id}`,
          {
            method: 'PUT',
            body: dto,
          }
        );
        if (res.error) {
          // Fallback update in local state for frontend preview
          setPurchaseOrders((prev) =>
            prev.map((p) => {
              if (p.id !== editingPO.id) return p;
              let totalUntaxed = 0;
              let totalTax = 0;
              const lines = dto.lineItems.map((l, i) => {
                const untaxed = l.quantity * l.unitPrice;
                const tax = untaxed * ((l.taxRate ?? 20) / 100);
                totalUntaxed += untaxed;
                totalTax += tax;
                const catItem = catalogItems.find((c) => c.id === l.productServiceId);
                return {
                  id: `line-${i}`,
                  productServiceId: l.productServiceId,
                  description: l.description || catItem?.name || 'Article',
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  taxRate: l.taxRate ?? 20,
                  totalPrice: untaxed + tax,
                };
              });
              return {
                ...p,
                supplierId: dto.supplierId,
                expectedDate: dto.expectedDate,
                notes: dto.notes,
                lineItems: lines,
                totalUntaxed,
                totalTax,
                totalAmount: totalUntaxed + totalTax,
                updatedAt: new Date().toISOString(),
              };
            })
          );
        }
      } else {
        const res = await ApiClient.request<PurchaseOrderDto>('/nexus/purchase-orders', {
          method: 'POST',
          body: dto,
        });
        if (res.error || !res.data) {
          // Fallback creation in local state for frontend preview
          let totalUntaxed = 0;
          let totalTax = 0;
          const lines = dto.lineItems.map((l, i) => {
            const untaxed = l.quantity * l.unitPrice;
            const tax = untaxed * ((l.taxRate ?? 20) / 100);
            totalUntaxed += untaxed;
            totalTax += tax;
            const catItem = catalogItems.find((c) => c.id === l.productServiceId);
            return {
              id: `line-${i}`,
              productServiceId: l.productServiceId,
              description: l.description || catItem?.name || 'Article',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate ?? 20,
              totalPrice: untaxed + tax,
            };
          });

          const newLocalPO: PurchaseOrderDto = {
            id: `po-local-${Date.now()}`,
            organizationId: 'org-1',
            supplierId: dto.supplierId,
            poNumber: `CMD-ACH-${String(purchaseOrders.length + 1).padStart(3, '0')}`,
            status: 'DRAFT',
            totalUntaxed,
            totalTax,
            totalAmount: totalUntaxed + totalTax,
            orderDate: new Date().toISOString(),
            expectedDate: dto.expectedDate,
            notes: dto.notes,
            lineItems: lines,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setPurchaseOrders((prev) => [newLocalPO, ...prev]);
        }
      }
      await fetchData();
    } catch (err: any) {
      throw new Error(err.message || 'Erreur lors de l\'enregistrement de la commande.');
    }
  };

  // Status transitions
  const handleConfirmAction = async () => {
    if (!confirmModal.po || !confirmModal.action) return;
    const poId = confirmModal.po.id;
    setActionLoading(true);

    try {
      let endpoint = '';
      if (confirmModal.action === 'ORDER') endpoint = `/nexus/purchase-orders/${poId}/mark-ordered`;
      else if (confirmModal.action === 'RECEIVE') endpoint = `/nexus/purchase-orders/${poId}/receive`;
      else if (confirmModal.action === 'CANCEL') endpoint = `/nexus/purchase-orders/${poId}/cancel`;

      const res = await ApiClient.request<PurchaseOrderDto>(endpoint, { method: 'POST' });
      if (res.error || !res.data) {
        // Fallback local status transition
        setPurchaseOrders((prev) =>
          prev.map((p) => {
            if (p.id !== poId) return p;
            let newStatus: POStatus = p.status;
            if (confirmModal.action === 'ORDER') newStatus = 'ORDERED';
            if (confirmModal.action === 'RECEIVE') newStatus = 'RECEIVED';
            if (confirmModal.action === 'CANCEL') newStatus = 'CANCELLED';
            return {
              ...p,
              status: newStatus,
              receivedAt: newStatus === 'RECEIVED' ? new Date().toISOString() : p.receivedAt,
              cancelledAt: newStatus === 'CANCELLED' ? new Date().toISOString() : p.cancelledAt,
              updatedAt: new Date().toISOString(),
            };
          })
        );
      }
      setConfirmModal({ isOpen: false, action: null, po: null });
      await fetchData();
    } catch (err: any) {
      alert(`Erreur: ${err.message || 'L\'opération a échoué.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Helper supplier name lookup
  const getSupplierName = (supplierId: string) => {
    const s = suppliers.find((supp) => supp.id === supplierId);
    return s ? s.name : supplierId;
  };

  // Filtered orders
  const filteredOrders = purchaseOrders.filter((po) => {
    const supplierName = getSupplierName(po.supplierId).toLowerCase();
    const poNum = po.poNumber.toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = poNum.includes(query) || supplierName.includes(query);
    const matchesStatus = statusFilter === 'ALL' || po.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // KPI Calculations
  const totalCount = purchaseOrders.length;
  const pendingPOs = purchaseOrders.filter((p) => p.status === 'DRAFT' || p.status === 'ORDERED');
  const pendingTotalAmount = pendingPOs.reduce((acc, p) => acc + p.totalAmount, 0);

  const receivedPOs = purchaseOrders.filter((p) => p.status === 'RECEIVED');
  const receivedTotalAmount = receivedPOs.reduce((acc, p) => acc + p.totalAmount, 0);

  const cancelledCount = purchaseOrders.filter((p) => p.status === 'CANCELLED').length;

  return (
    <PermissionGuard permission="nexus:purchase-orders:read">
      <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
              Commandes d'Achat
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Gestion du réapprovisionnement, bons de commande fournisseurs et réceptions de stock.
            </p>
          </div>

          <PermissionGuard permission="nexus:purchase-orders:create">
            <button
              onClick={() => {
                setEditingPO(null);
                setIsModalOpen(true);
              }}
              style={{
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              <span>+</span>
              <span>Nouvelle Commande</span>
            </button>
          </PermissionGuard>
        </div>

        {/* KPIs Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: 20,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
              Total Commandes
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{totalCount}</div>
          </div>

          <div
            style={{
              backgroundColor: '#ffffff',
              padding: 20,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ fontSize: 13, color: '#0284c7', fontWeight: 600, marginBottom: 4 }}>
              Commandes en Cours ({pendingPOs.length})
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7' }}>
              {pendingTotalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#ffffff',
              padding: 20,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>
              Total Réceptionné ({receivedPOs.length})
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>
              {receivedTotalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#ffffff',
              padding: 20,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ fontSize: 13, color: '#be123c', fontWeight: 600, marginBottom: 4 }}>
              Commandes Annulées
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#be123c' }}>{cancelledCount}</div>
          </div>
        </div>

        {/* Filters & Search */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 16,
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Search bar */}
          <input
            type="text"
            placeholder="Rechercher par N° de commande ou fournisseur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              minWidth: 280,
              flex: 1,
            }}
          />

          {/* Status Filter Buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'Toutes' },
              { id: 'DRAFT', label: 'Brouillons' },
              { id: 'ORDERED', label: 'Commandées' },
              { id: 'RECEIVED', label: 'Réceptionnées' },
              { id: 'CANCELLED', label: 'Annulées' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: statusFilter === tab.id ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  backgroundColor: statusFilter === tab.id ? '#0284c7' : '#ffffff',
                  color: statusFilter === tab.id ? '#ffffff' : '#64748b',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#991b1b',
              marginBottom: 20,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Main Content Area */}
        {loading ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              backgroundColor: '#ffffff',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>Chargement des commandes d'achat...</div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              backgroundColor: '#ffffff',
              borderRadius: 10,
              border: '1px dashed #cbd5e1',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Aucune commande d'achat trouvée
            </h3>
            <p style={{ margin: '6px 0 16px 0', fontSize: 14, color: '#64748b' }}>
              {searchQuery || statusFilter !== 'ALL'
                ? 'Aucun résultat ne correspond à vos filtres de recherche.'
                : 'Créez votre première commande fournisseur pour suivre vos approvisionnements.'}
            </p>
            {!searchQuery && statusFilter === 'ALL' && (
              <PermissionGuard permission="nexus:purchase-orders:create">
                <button
                  onClick={() => {
                    setEditingPO(null);
                    setIsModalOpen(true);
                  }}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Créer une commande
                </button>
              </PermissionGuard>
            )}
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Code PO</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Fournisseur</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Date Commande</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Livraison Prévue</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Statut</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Total HT</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Total TTC</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((po) => {
                    const statusCfg = STATUS_CONFIG[po.status];
                    const isLocked = po.status === 'RECEIVED' || po.status === 'CANCELLED';

                    return (
                      <tr key={po.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                          {po.poNumber}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {getSupplierName(po.supplierId)}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b' }}>
                          {new Date(po.orderDate).toLocaleDateString('fr-FR')}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b' }}>
                          {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('fr-FR') : '-'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 700,
                              backgroundColor: statusCfg.bg,
                              color: statusCfg.color,
                              border: `1px solid ${statusCfg.border}`,
                            }}
                          >
                            {statusCfg.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#475569' }}>
                          {po.totalUntaxed.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          {po.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {/* Edit Button */}
                            <PermissionGuard permission="nexus:purchase-orders:update">
                              <button
                                onClick={() => {
                                  setEditingPO(po);
                                  setIsModalOpen(true);
                                }}
                                disabled={isLocked}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  backgroundColor: isLocked ? '#f1f5f9' : '#ffffff',
                                  color: isLocked ? '#94a3b8' : '#334155',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: isLocked ? 'not-allowed' : 'pointer',
                                }}
                                title={isLocked ? 'Commande verrouillée' : 'Modifier'}
                              >
                                Modifier
                              </button>
                            </PermissionGuard>

                            {/* State Transition Actions */}
                            {po.status === 'DRAFT' && (
                              <PermissionGuard permission="nexus:purchase-orders:update">
                                <button
                                  onClick={() => setConfirmModal({ isOpen: true, action: 'ORDER', po })}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 4,
                                    border: 'none',
                                    backgroundColor: '#0284c7',
                                    color: '#ffffff',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Commander
                                </button>
                              </PermissionGuard>
                            )}

                            {(po.status === 'ORDERED' || po.status === 'DRAFT') && (
                              <PermissionGuard permission="nexus:purchase-orders:update">
                                <button
                                  onClick={() => setConfirmModal({ isOpen: true, action: 'RECEIVE', po })}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 4,
                                    border: 'none',
                                    backgroundColor: '#16a34a',
                                    color: '#ffffff',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Réceptionner
                                </button>
                              </PermissionGuard>
                            )}

                            {!isLocked && (
                              <PermissionGuard permission="nexus:purchase-orders:delete">
                                <button
                                  onClick={() => setConfirmModal({ isOpen: true, action: 'CANCEL', po })}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 4,
                                    border: '1px solid #fecaca',
                                    backgroundColor: '#fef2f2',
                                    color: '#991b1b',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Annuler
                                </button>
                              </PermissionGuard>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal for Create/Edit */}
        <PurchaseOrderModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePO}
          initialData={editingPO}
          suppliers={suppliers}
          catalogItems={catalogItems}
        />

        {/* Confirmation Modal */}
        {confirmModal.isOpen && confirmModal.po && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: 16,
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 12,
                padding: 24,
                maxWidth: 480,
                width: '100%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                {confirmModal.action === 'ORDER' && 'Passer la commande ?'}
                {confirmModal.action === 'RECEIVE' && 'Réceptionner la commande ?'}
                {confirmModal.action === 'CANCEL' && 'Annuler la commande ?'}
              </h3>

              <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                {confirmModal.action === 'ORDER' && (
                  <>
                    Voulez-vous passer la commande <strong>{confirmModal.po.poNumber}</strong> à l'état
                    "Commandée" ?
                  </>
                )}
                {confirmModal.action === 'RECEIVE' && (
                  <>
                    La réception de la commande <strong>{confirmModal.po.poNumber}</strong> enregistrera un
                    mouvement d'entrée en stock (<strong>IN</strong>) pour l'ensemble des articles stockables.
                    Cette opération est définitive.
                  </>
                )}
                {confirmModal.action === 'CANCEL' && (
                  <>
                    Êtes-vous sûr de vouloir annuler la commande <strong>{confirmModal.po.poNumber}</strong> ?
                  </>
                )}
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={() => setConfirmModal({ isOpen: false, action: null, po: null })}
                  disabled={actionLoading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor:
                      confirmModal.action === 'CANCEL'
                        ? '#dc2626'
                        : confirmModal.action === 'RECEIVE'
                        ? '#16a34a'
                        : '#0284c7',
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? 'Traitement...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
