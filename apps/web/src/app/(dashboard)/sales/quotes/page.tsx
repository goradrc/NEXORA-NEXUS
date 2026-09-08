'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';
import { usePermissions } from '../../../../hooks/usePermissions';
import {
  LocalQuote,
  LocalCustomer,
  LocalProduct,
  localDb,
} from '../../../../offline/db';
import { QuoteModal } from '../../../../components/sales/QuoteModal';

export default function QuotesPage() {
  const canRead = usePermissions('nexus:quotes:read');
  const canWrite = usePermissions('nexus:quotes:write');

  const [quotes, setQuotes] = useState<LocalQuote[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<LocalQuote | null>(null);

  const loadData = () => {
    setQuotes([...localDb.quotes]);
    setCustomers([...localDb.customers]);
    setProducts([...localDb.products]);
  };

  useEffect(() => {
    loadData();
  }, []);

  const customerMap = useMemo(() => {
    const map = new Map<string, LocalCustomer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter((quote) => {
      const customer = customerMap.get(quote.customerId);
      const matchesSearch =
        quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer && customer.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        selectedStatus === 'ALL' || quote.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [quotes, searchTerm, selectedStatus, customerMap]);

  const handleOpenCreateModal = () => {
    setEditingQuote(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (quote: LocalQuote) => {
    setEditingQuote(quote);
    setIsModalOpen(true);
  };

  const handleSaveQuote = (data: Partial<LocalQuote>) => {
    if (editingQuote) {
      // Update
      const index = localDb.quotes.findIndex((q) => q.id === editingQuote.id);
      if (index !== -1) {
        const lineItems = data.lineItems || [];
        const totalUntaxed = lineItems.reduce((sum, l) => sum + (l.totalPrice || 0), 0);
        const totalTax = lineItems.reduce(
          (sum, l) => sum + Number(((l.totalPrice || 0) * ((l.taxRate || 0) / 100)).toFixed(2)),
          0
        );
        const totalAmount = Number((totalUntaxed + totalTax).toFixed(2));

        localDb.quotes[index] = {
          ...localDb.quotes[index],
          ...data,
          totalUntaxed,
          totalTax,
          totalAmount,
        } as LocalQuote;
      }
    } else {
      // Create
      const lineItems = data.lineItems || [];
      const totalUntaxed = lineItems.reduce((sum, l) => sum + (l.totalPrice || 0), 0);
      const totalTax = lineItems.reduce(
        (sum, l) => sum + Number(((l.totalPrice || 0) * ((l.taxRate || 0) / 100)).toFixed(2)),
        0
      );
      const totalAmount = Number((totalUntaxed + totalTax).toFixed(2));

      const newQuote: LocalQuote = {
        id: crypto.randomUUID(),
        organizationId: 'org-demo',
        customerId: data.customerId!,
        quoteNumber: `DEV-2026-${String(localDb.quotes.length + 1).padStart(4, '0')}`,
        status: data.status || 'DRAFT',
        totalUntaxed,
        totalTax,
        totalAmount,
        validUntil: data.validUntil || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lineItems,
      };

      localDb.quotes.push(newQuote);
    }

    loadData();
    setIsModalOpen(false);
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
        return { label: 'Refusé', bg: '#fee2e2', color: '#b91c1c' };
      case 'CONVERTED':
        return { label: 'Converti', bg: '#f3e8ff', color: '#7e22ce' };
      default:
        return { label: status, bg: '#f1f5f9', color: '#475569' };
    }
  };

  if (!canRead) {
    return (
      <PermissionGuard permission="nexus:quotes:read">
        <div>Accès non autorisé aux Devis.</div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="nexus:quotes:read">
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
              📜 Devis & Proformas Commerciales
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Gestion, suivi et conversion des offres commerciales
            </p>
          </div>

          {canWrite && (
            <button
              onClick={handleOpenCreateModal}
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
              ➕ Nouveau Devis
            </button>
          )}
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
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  N° DEVIS
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  CLIENT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  STATUT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  VALIDITÉ
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  TOTAL TTC
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
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
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
                        {quote.validUntil
                          ? new Date(quote.validUntil).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                        {quote.totalAmount.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          {canWrite && (
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
