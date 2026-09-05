'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import { localDb, LocalQuote, LocalCustomer, LocalProduct, LocalInvoice } from '../../../../offline/db';
import { QuoteModal } from '../../../../components/sales/QuoteModal';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';

export default function QuotesPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const canCreate = usePermissions('nexus:quotes:create');
  const canUpdate = usePermissions('nexus:quotes:update');
  const canDelete = usePermissions('nexus:quotes:delete');
  const canCreateInvoice = usePermissions('nexus:invoices:create');

  const [quotes, setQuotes] = useState<LocalQuote[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<LocalQuote | null>(null);

  useEffect(() => {
    const orgQuotes = localDb.quotes.filter((q) => q.organizationId === orgId);
    const orgCustomers = localDb.customers.filter((c) => c.organizationId === orgId);
    const orgProducts = localDb.products.filter((p) => p.organizationId === orgId);

    setQuotes([...orgQuotes]);
    setCustomers([...orgCustomers]);
    setProducts([...orgProducts]);
  }, [orgId]);

  const customerMap = useMemo(() => {
    const map = new Map<string, LocalCustomer>();
    for (const c of customers) {
      map.set(c.id, c);
    }
    return map;
  }, [customers]);

  const filteredQuotes = useMemo(() => {
    let result = quotes;

    if (selectedStatus !== 'ALL') {
      result = result.filter((q) => q.status === selectedStatus);
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;

    return result.filter((q) => {
      const cust = customerMap.get(q.customerId);
      const custName = cust ? cust.name.toLowerCase() : '';
      return q.quoteNumber.toLowerCase().includes(term) || custName.includes(term);
    });
  }, [quotes, selectedStatus, searchTerm, customerMap]);

  const handleOpenCreateModal = () => {
    setEditingQuote(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (quote: LocalQuote) => {
    setEditingQuote(quote);
    setIsModalOpen(true);
  };

  const handleSaveQuote = async (data: Partial<LocalQuote>) => {
    let totalUntaxed = 0;
    let totalTax = 0;

    const lines = (data.lineItems || []).map((l) => {
      const qty = Math.max(0, l.quantity || 0);
      const price = Math.max(0, l.unitPrice || 0);
      const disc = Math.min(100, Math.max(0, l.discountPercent || 0));
      const lineHT = Number((qty * price * (1 - disc / 100)).toFixed(2));
      const taxRate = Math.max(0, l.taxRate || 0);
      const lineTax = Number((lineHT * (taxRate / 100)).toFixed(2));

      totalUntaxed += lineHT;
      totalTax += lineTax;

      return {
        ...l,
        taxRate,
        discountPercent: disc,
        totalPrice: lineHT,
      };
    });

    totalUntaxed = Number(totalUntaxed.toFixed(2));
    totalTax = Number(totalTax.toFixed(2));
    const totalAmount = Number((totalUntaxed + totalTax).toFixed(2));

    if (editingQuote) {
      const updated: LocalQuote = {
        ...editingQuote,
        customerId: data.customerId || editingQuote.customerId,
        status: data.status || editingQuote.status,
        validUntil: data.validUntil || editingQuote.validUntil,
        totalUntaxed,
        totalTax,
        totalAmount,
        lineItems: lines,
      };

      const idx = localDb.quotes.findIndex((q) => q.id === editingQuote.id && q.organizationId === orgId);
      if (idx !== -1) {
        localDb.quotes[idx] = updated;
      }

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Quote',
        entityId: updated.id,
        operation: 'UPDATE',
        payload: updated,
      });
    } else {
      const count = localDb.quotes.filter((q) => q.organizationId === orgId).length;
      const quoteNumber = `TEMP-DEV-${(count + 1).toString().padStart(4, '0')}`;
      const newQuote: LocalQuote = {
        id: `q-${crypto.randomUUID()}`,
        organizationId: orgId,
        customerId: data.customerId || (customers[0]?.id || 'cli-001'),
        quoteNumber,
        status: (data.status as any) || 'DRAFT',
        totalUntaxed,
        totalTax,
        totalAmount,
        validUntil: data.validUntil || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        lineItems: lines,
      };

      localDb.quotes.push(newQuote);

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Quote',
        entityId: newQuote.id,
        operation: 'INSERT',
        payload: newQuote,
      });
    }

    const refreshed = localDb.quotes.filter((q) => q.organizationId === orgId);
    setQuotes([...refreshed]);
    setIsModalOpen(false);
  };

  const handleConvertQuoteToInvoice = async (quote: LocalQuote) => {
    if (!confirm(`Voulez-vous convertir le devis ${quote.quoteNumber} en Facture de Vente ?`)) return;

    // Mark Quote CONVERTED
    quote.status = 'CONVERTED';
    const qIdx = localDb.quotes.findIndex((q) => q.id === quote.id);
    if (qIdx !== -1) localDb.quotes[qIdx] = quote;

    // Create Invoice
    const invCount = localDb.invoices.filter((i) => i.organizationId === orgId).length;
    const invoiceNumber = `TEMP-FAC-${(invCount + 1).toString().padStart(4, '0')}`;

    const newInvoice: LocalInvoice = {
      id: `inv-${crypto.randomUUID()}`,
      organizationId: orgId,
      customerId: quote.customerId,
      quoteId: quote.id,
      invoiceNumber,
      status: 'UNPAID',
      totalUntaxed: quote.totalUntaxed,
      totalTax: quote.totalTax,
      totalAmount: quote.totalAmount,
      amountPaid: 0,
      amountDue: quote.totalAmount,
      dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      lineItems: quote.lineItems.map((l) => ({ ...l, id: `line-${crypto.randomUUID()}` })),
    };

    localDb.invoices.push(newInvoice);

    // Mutations
    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Quote',
      entityId: quote.id,
      operation: 'UPDATE',
      payload: quote,
    });

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Invoice',
      entityId: newInvoice.id,
      operation: 'INSERT',
      payload: newInvoice,
    });

    const refreshed = localDb.quotes.filter((q) => q.organizationId === orgId);
    setQuotes([...refreshed]);
    alert(`Devis converti avec succès en Facture ${invoiceNumber} !`);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce devis ?')) return;

    localDb.quotes = localDb.quotes.filter((q) => !(q.id === quoteId && q.organizationId === orgId));

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Quote',
      entityId: quoteId,
      operation: 'DELETE',
      payload: { id: quoteId },
    });

    const refreshed = localDb.quotes.filter((q) => q.organizationId === orgId);
    setQuotes([...refreshed]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Brouillon', bg: '#f1f5f9', color: '#475569' };
      case 'SENT':
        return { label: 'Envoyé', bg: '#e0f2fe', color: '#0369a1' };
      case 'ACCEPTED':
        return { label: 'Accepté', bg: '#dcfce7', color: '#15803d' };
      case 'REJECTED':
        return { label: 'Refusé', bg: '#fef2f2', color: '#dc2626' };
      case 'CONVERTED':
        return { label: 'Converti en Facture', bg: '#f3e8ff', color: '#6b21a8' };
      default:
        return { label: status, bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <PermissionGuard permission="nexus:quotes:read">
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
              Devis & Proformas Commerciales
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Élaboration, suivi et conversion des devis pour <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
            </p>
          </div>

          {canCreate && (
            <button
              onClick={handleOpenCreateModal}
              style={{
                padding: '10px 18px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>➕</span> Nouveau Devis
            </button>
          )}
        </div>

        {/* Search & Filters */}
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
            placeholder="Rechercher par N° devis ou nom de client..."
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
            <option value="SENT">Envoyés</option>
            <option value="ACCEPTED">Acceptés</option>
            <option value="REJECTED">Refusés</option>
            <option value="CONVERTED">Convertis</option>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>N° DEVIS</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>CLIENT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>STATUT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>VALIDITÉ</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>TOTAL HT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>TOTAL TTC</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Aucun devis trouvé.
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((quote) => {
                  const cust = customerMap.get(quote.customerId);
                  const badge = getStatusBadge(quote.status);

                  return (
                    <tr key={quote.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        <code>{quote.quoteNumber}</code>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {cust ? cust.name : 'Client Inconnu'}
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
                        {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {quote.totalUntaxed.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0284c7' }}>
                        {quote.totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          {quote.status === 'ACCEPTED' && canCreateInvoice && (
                            <button
                              onClick={() => handleConvertQuoteToInvoice(quote)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #a855f7',
                                backgroundColor: '#faf5ff',
                                color: '#7e22ce',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ⚡ Convertir en Facture
                            </button>
                          )}

                          {canUpdate && quote.status !== 'CONVERTED' && (
                            <button
                              onClick={() => handleOpenEditModal(quote)}
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
                              ✏️ Éditer
                            </button>
                          )}

                          {canDelete && quote.status !== 'CONVERTED' && (
                            <button
                              onClick={() => handleDeleteQuote(quote.id)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #fecaca',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              🗑️ Supprimer
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
        <QuoteModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveQuote}
          initialData={editingQuote}
          customers={customers}
          products={products}
        />
      </div>
    </PermissionGuard>
  );
}
