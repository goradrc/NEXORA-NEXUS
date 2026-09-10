'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';
import { usePermissions } from '../../../../hooks/usePermissions';
import { LocalCustomer, LocalProduct, localDb } from '../../../../offline/db';
import { DeliveryNoteDto, CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from '@nexora/nexus';
import { SalesApiClient } from '../../../../services/sales-api';
import { DeliveryNoteModal } from '../../../../components/sales/DeliveryNoteModal';

export default function DeliveryNotesPage() {
  const canRead = usePermissions('nexus:delivery-notes:read');
  const canCreate = usePermissions('nexus:delivery-notes:create');
  const canUpdate = usePermissions('nexus:delivery-notes:update');
  const canManage = usePermissions('nexus:delivery-notes:manage');

  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteDto[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const requestPending = useRef(false);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeliveryNote, setEditingDeliveryNote] = useState<DeliveryNoteDto | null>(null);
  const [selectedDetailNote, setSelectedDetailNote] = useState<DeliveryNoteDto | null>(null);

  const loadData = async (requestedOffset = offset) => {
    if (requestPending.current) return;
    requestPending.current = true;
    setLoading(true);
    setErrorMessage(null);

    // Offline data for dropdowns
    setCustomers([...localDb.customers]);
    setProducts([...localDb.products]);

    try {
      const response = await SalesApiClient.getDeliveryNotes(requestedOffset);
      if (response.error) {
        setErrorMessage(response.error);
      } else if (response.data) {
        setDeliveryNotes(response.data);
        setOffset(requestedOffset);
        setHasNextPage(response.data.length === 100);
      }
    } catch {
      setErrorMessage('Impossible de charger les bons de livraison. Réessayez.');
    } finally {
      requestPending.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) void loadData(0);
  }, [canRead]);

  const customerMap = useMemo(() => {
    const map = new Map<string, LocalCustomer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const filteredDeliveryNotes = useMemo(() => {
    return deliveryNotes.filter((note) => {
      const customer = customerMap.get(note.customerId);
      const matchesSearch =
        note.deliveryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer && customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (note.carrierName && note.carrierName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (note.trackingNumber && note.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = selectedStatus === 'ALL' || note.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [deliveryNotes, searchTerm, selectedStatus, customerMap]);

  // KPIs
  const totalNotes = deliveryNotes.length;
  const draftNotes = deliveryNotes.filter((dn) => dn.status === 'DRAFT').length;
  const shippedNotes = deliveryNotes.filter((dn) => dn.status === 'SHIPPED').length;
  const deliveredNotes = deliveryNotes.filter((dn) => dn.status === 'DELIVERED').length;

  const handleOpenCreateModal = () => {
    if (!canCreate) return;
    setEditingDeliveryNote(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (note: DeliveryNoteDto) => {
    if (!canUpdate || note.status !== 'DRAFT') return;
    setEditingDeliveryNote(note);
    setIsModalOpen(true);
  };

  const handleSaveDeliveryNote = async (data: CreateDeliveryNoteDto | UpdateDeliveryNoteDto, key?: string) => {
    if (editingDeliveryNote ? !canUpdate : !canCreate) return;
    setActionLoading(true);
    setErrorMessage(null);

    if (editingDeliveryNote) {
      const res = await SalesApiClient.updateDeliveryNote(editingDeliveryNote.id, data as UpdateDeliveryNoteDto);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setIsModalOpen(false);
        await loadData();
      }
    } else {
      const createPayload: CreateDeliveryNoteDto = {
        ...(data as CreateDeliveryNoteDto),
        idempotencyKey: key || (data as CreateDeliveryNoteDto).idempotencyKey || crypto.randomUUID(),
      };
      const res = await SalesApiClient.createDeliveryNote(createPayload);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setIsModalOpen(false);
        await loadData();
      }
    }
    setActionLoading(false);
  };

  const handleShip = async (note: DeliveryNoteDto) => {
    if (!confirm(`Confirmer l'expédition du bon ${note.deliveryNumber} ?`)) return;
    setActionLoading(true);
    setErrorMessage(null);
    const key = crypto.randomUUID();
    const res = await SalesApiClient.shipDeliveryNote(note.id, key);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      await loadData();
      if (selectedDetailNote?.id === note.id && res.data) {
        setSelectedDetailNote(res.data);
      }
    }
    setActionLoading(false);
  };

  const handleDeliver = async (note: DeliveryNoteDto) => {
    if (!canManage || note.status !== 'SHIPPED') return;
    if (!confirm(`Confirmer la livraison du bon ${note.deliveryNumber} ? (Déstockage des produits)`)) return;
    setActionLoading(true);
    setErrorMessage(null);
    const key = crypto.randomUUID();
    const res = await SalesApiClient.deliverDeliveryNote(note.id, key);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      await loadData();
      if (selectedDetailNote?.id === note.id && res.data) {
        setSelectedDetailNote(res.data);
      }
    }
    setActionLoading(false);
  };

  const handleCancel = async (note: DeliveryNoteDto) => {
    if (!confirm(`Êtes-vous sûr de vouloir annuler le bon ${note.deliveryNumber} ?`)) return;
    setActionLoading(true);
    setErrorMessage(null);
    const key = crypto.randomUUID();
    const res = await SalesApiClient.cancelDeliveryNote(note.id, key);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      await loadData();
      if (selectedDetailNote?.id === note.id && res.data) {
        setSelectedDetailNote(res.data);
      }
    }
    setActionLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Brouillon', bg: '#f1f5f9', color: '#475569' };
      case 'SHIPPED':
        return { label: 'Expédié', bg: '#e0f2fe', color: '#0369a1' };
      case 'DELIVERED':
        return { label: 'Livré', bg: '#dcfce7', color: '#15803d' };
      case 'CANCELLED':
        return { label: 'Annulé', bg: '#fee2e2', color: '#b91c1c' };
      default:
        return { label: status, bg: '#f1f5f9', color: '#475569' };
    }
  };

  if (!canRead) {
    return (
      <PermissionGuard permission="nexus:delivery-notes:read">
        <div>Accès non autorisé aux Bons de Livraison.</div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="nexus:delivery-notes:read">
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
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
              📦 Bons de Livraison
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Suivi des expéditions, livraisons clients et déstockage
            </p>
          </div>

          {canCreate && (
            <button
              onClick={handleOpenCreateModal}
              disabled={actionLoading || loading}
              style={{
                padding: '10px 18px',
                borderRadius: 6,
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ➕ Nouveau Bon de Livraison
            </button>
          )}
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              color: '#dc2626',
              fontSize: 14,
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>⚠️ {errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        <p>Les compteurs et les filtres concernent uniquement la page affichée.</p>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Bons sur cette page</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{totalNotes}</div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Brouillons</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#475569', marginTop: 4 }}>{draftNotes}</div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>En Cours (Expédiés)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{shippedNotes}</div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Livrés</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>{deliveredNotes}</div>
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
            placeholder="Rechercher par N° bon, client, transporteur, n° suivi..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: 260,
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
            <option value="ALL">Tous les Statuts</option>
            <option value="DRAFT">Brouillons</option>
            <option value="SHIPPED">Expédiés</option>
            <option value="DELIVERED">Livrés</option>
            <option value="CANCELLED">Annulés</option>
          </select>
        </div>

        {/* Data Table */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
              Chargement des bons de livraison...
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    N° BON
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    CLIENT
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    STATUT
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    TRANSPORTEUR / SUIVI
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    DATE CRÉATION
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#475569',
                      textAlign: 'right',
                    }}
                  >
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliveryNotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                      Aucun bon de livraison trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredDeliveryNotes.map((note) => {
                    const cust = customerMap.get(note.customerId);
                    const badge = getStatusBadge(note.status);

                    return (
                      <tr key={note.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                          <button
                            onClick={() => setSelectedDetailNote(note)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0284c7',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            <code>{note.deliveryNumber}</code>
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {cust ? cust.name : note.customerId}
                          </div>
                          {cust?.companyName && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>{cust.companyName}</div>
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
                        <td style={{ padding: '14px 16px', color: '#475569' }}>
                          <div>{note.carrierName || '—'}</div>
                          {note.trackingNumber && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>N° {note.trackingNumber}</div>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#475569' }}>
                          {note.createdAt ? new Date(note.createdAt).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setSelectedDetailNote(note)}
                              style={{
                                padding: '5px 8px',
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              👁️ Détails
                            </button>

                            {canUpdate && note.status === 'DRAFT' && (
                              <button
                                onClick={() => handleOpenEditModal(note)}
                                disabled={actionLoading || loading}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  backgroundColor: '#ffffff',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                ✏️ Éditer
                              </button>
                            )}

                            {canManage && note.status === 'DRAFT' && (
                              <button
                                onClick={() => handleShip(note)}
                                disabled={actionLoading || loading}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #0284c7',
                                  backgroundColor: '#e0f2fe',
                                  color: '#0369a1',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                🚚 Expédier
                              </button>
                            )}

                            {canManage && note.status === 'SHIPPED' && (
                              <button
                                onClick={() => handleDeliver(note)}
                                disabled={actionLoading || loading}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #16a34a',
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                ✅ Livrer
                              </button>
                            )}

                            {canManage && note.status !== 'CANCELLED' && note.status !== 'DELIVERED' && (
                              <button
                                onClick={() => handleCancel(note)}
                                disabled={actionLoading || loading}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #fecaca',
                                  backgroundColor: '#fef2f2',
                                  color: '#dc2626',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                🚫 Annuler
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
          )}
        </div>

        <nav aria-label="Pagination des bons de livraison" style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
          <button disabled={loading || actionLoading || offset === 0} onClick={() => loadData(Math.max(0, offset - 100))}>Précédent</button>
          <span role="status">Page {offset / 100 + 1}</span>
          <button disabled={loading || actionLoading || !hasNextPage} onClick={() => loadData(offset + 100)}>Suivant</button>
          <button disabled={loading || actionLoading} onClick={() => loadData()}>Actualiser</button>
        </nav>

        {/* Modal Drawer for Details */}
        {selectedDetailNote && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 8,
                maxWidth: 700,
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: 24,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>
                    Bon de Livraison : {selectedDetailNote.deliveryNumber}
                  </h2>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 4,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: getStatusBadge(selectedDetailNote.status).bg,
                      color: getStatusBadge(selectedDetailNote.status).color,
                    }}
                  >
                    {getStatusBadge(selectedDetailNote.status).label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDetailNote(null)}
                  style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 14 }}>
                <div>
                  <strong>Client :</strong>{' '}
                  {customerMap.get(selectedDetailNote.customerId)?.name || selectedDetailNote.customerId}
                </div>
                <div>
                  <strong>Transporteur :</strong> {selectedDetailNote.carrierName || 'Non spécifié'}
                </div>
                <div>
                  <strong>Adresse :</strong> {selectedDetailNote.shippingAddress || 'Non spécifiée'}
                </div>
                <div>
                  <strong>N° Suivi :</strong> {selectedDetailNote.trackingNumber || 'Non spécifié'}
                </div>
                <div>
                  <strong>Expédié le :</strong>{' '}
                  {selectedDetailNote.shippedAt
                    ? new Date(selectedDetailNote.shippedAt).toLocaleString('fr-FR')
                    : '—'}
                </div>
                <div>
                  <strong>Livré le :</strong>{' '}
                  {selectedDetailNote.deliveredAt
                    ? new Date(selectedDetailNote.deliveredAt).toLocaleString('fr-FR')
                    : '—'}
                </div>
              </div>

              {selectedDetailNote.notes && (
                <div style={{ marginBottom: 16, padding: 10, backgroundColor: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
                  <strong>Notes :</strong> {selectedDetailNote.notes}
                </div>
              )}

              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Articles inclus :</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Quantité</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Prix Unitaire HT</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDetailNote.lineItems?.map((line) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px' }}>{line.description}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{line.quantity}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {line.unitPrice.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setSelectedDetailNote(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Form */}
        <DeliveryNoteModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveDeliveryNote}
          initialData={editingDeliveryNote}
          customers={customers}
          products={products}
          loading={actionLoading}
        />
      </div>
    </PermissionGuard>
  );
}
