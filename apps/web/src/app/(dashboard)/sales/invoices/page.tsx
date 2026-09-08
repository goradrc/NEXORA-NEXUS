'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';
import { usePermissions } from '../../../../hooks/usePermissions';
import {
  LocalInvoice,
  LocalPayment,
  LocalCustomer,
  LocalProduct,
  localDb,
} from '../../../../offline/db';
import { InvoiceModal } from '../../../../components/sales/InvoiceModal';
import { PaymentModal } from '../../../../components/sales/PaymentModal';

export default function InvoicesPage() {
  const canRead = usePermissions('nexus:invoices:read');
  const canWrite = usePermissions('nexus:invoices:write');
  const canDelete = usePermissions('nexus:invoices:delete');
  const canCreatePayment = usePermissions('nexus:payments:write');

  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<LocalInvoice | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<LocalInvoice | null>(null);

  const loadData = () => {
    setInvoices([...localDb.invoices]);
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

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const customer = customerMap.get(invoice.customerId);
      const matchesSearch =
        invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer && customer.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        selectedStatus === 'ALL' || invoice.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, selectedStatus, customerMap]);

  // Financial KPIs
  const totalInvoiced = useMemo(
    () => invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
    [invoices]
  );
  const totalCollected = useMemo(
    () => invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
    [invoices]
  );
  const totalReceivables = useMemo(
    () => invoices.reduce((sum, inv) => sum + inv.amountDue, 0),
    [invoices]
  );

  const handleOpenCreateModal = () => {
    setEditingInvoice(null);
    setIsInvoiceModalOpen(true);
  };

  const handleOpenEditModal = (invoice: LocalInvoice) => {
    setEditingInvoice(invoice);
    setIsInvoiceModalOpen(true);
  };

  const handleOpenPaymentModal = (invoice: LocalInvoice) => {
    setPayingInvoice(invoice);
    setIsPaymentModalOpen(true);
  };

  const handleSaveInvoice = (data: Partial<LocalInvoice>) => {
    if (editingInvoice) {
      // Update
      const index = localDb.invoices.findIndex((i) => i.id === editingInvoice.id);
      if (index !== -1) {
        const lineItems = data.lineItems || [];
        const totalUntaxed = lineItems.reduce((sum, l) => sum + (l.totalPrice || 0), 0);
        const totalTax = lineItems.reduce(
          (sum, l) => sum + Number(((l.totalPrice || 0) * ((l.taxRate || 0) / 100)).toFixed(2)),
          0
        );
        const totalAmount = Number((totalUntaxed + totalTax).toFixed(2));
        const amountPaid = localDb.invoices[index].amountPaid || 0;
        const amountDue = Math.max(0, totalAmount - amountPaid);

        localDb.invoices[index] = {
          ...localDb.invoices[index],
          ...data,
          totalUntaxed,
          totalTax,
          totalAmount,
          amountDue,
        } as LocalInvoice;
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

      const newInvoice: LocalInvoice = {
        id: crypto.randomUUID(),
        organizationId: 'org-demo',
        customerId: data.customerId!,
        invoiceNumber: `FAC-2026-${String(localDb.invoices.length + 1).padStart(4, '0')}`,
        status: data.status || 'UNPAID',
        totalUntaxed,
        totalTax,
        totalAmount,
        amountPaid: 0,
        amountDue: totalAmount,
        dueDate: data.dueDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lineItems,
      };

      localDb.invoices.push(newInvoice);
    }

    loadData();
    setIsInvoiceModalOpen(false);
  };

  const handleSavePayment = (data: Partial<LocalPayment>) => {
    if (!payingInvoice) return;

    const amount = data.amount || 0;
    const newPayment: LocalPayment = {
      id: crypto.randomUUID(),
      organizationId: payingInvoice.organizationId,
      customerId: payingInvoice.customerId,
      invoiceId: payingInvoice.id,
      paymentNumber: `PAY-2026-${String(localDb.payments.length + 1).padStart(4, '0')}`,
      amount,
      paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
      referenceCode: data.referenceCode,
      paymentDate: data.paymentDate || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    localDb.payments.push(newPayment);

    // Update Invoice balances
    const invIndex = localDb.invoices.findIndex((i) => i.id === payingInvoice.id);
    if (invIndex !== -1) {
      const inv = localDb.invoices[invIndex];
      const newPaid = Number((inv.amountPaid + amount).toFixed(2));
      const newDue = Math.max(0, Number((inv.totalAmount - newPaid).toFixed(2)));
      const newStatus = newDue === 0 ? 'PAID' : 'PARTIAL';

      localDb.invoices[invIndex] = {
        ...inv,
        amountPaid: newPaid,
        amountDue: newDue,
        status: newStatus,
      };
    }

    loadData();
    setIsPaymentModalOpen(false);
  };

  const handleDeleteInvoice = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette facture brouillon ?')) {
      localDb.invoices = localDb.invoices.filter((i) => i.id !== id);
      loadData();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Brouillon', bg: '#f1f5f9', color: '#475569' };
      case 'UNPAID':
        return { label: 'Non Payée', bg: '#fef3c7', color: '#b45309' };
      case 'PARTIAL':
        return { label: 'Partielle', bg: '#e0f2fe', color: '#0369a1' };
      case 'PAID':
        return { label: 'Payée', bg: '#dcfce7', color: '#15803d' };
      case 'CANCELLED':
        return { label: 'Annulée', bg: '#fee2e2', color: '#b91c1c' };
      default:
        return { label: status, bg: '#f1f5f9', color: '#475569' };
    }
  };

  if (!canRead) {
    return (
      <PermissionGuard permission="nexus:invoices:read">
        <div>Accès non autorisé aux Factures.</div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="nexus:invoices:read">
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
              🧾 Factures de Vente
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Gestion des factures clients, suivi des paiements et encaissements
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
              ➕ Nouvelle Facture
            </button>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Facturé TTC</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {totalInvoiced.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Montant Encaissé</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
              {totalCollected.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Reste à Recouvrer</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
              {totalReceivables.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
            placeholder="Rechercher par N° facture ou nom de client..."
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
            <option value="UNPAID">Non Payées</option>
            <option value="PARTIAL">Partiellement Payées</option>
            <option value="PAID">Payées</option>
            <option value="CANCELLED">Annulées</option>
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
                  N° FACTURE
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  CLIENT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  STATUT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  ÉCHÉANCE
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  TOTAL TTC
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  PAYÉ
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  RESTE DÛ
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
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Aucune facture trouvée.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const cust = customerMap.get(invoice.customerId);
                  const badge = getStatusBadge(invoice.status);

                  return (
                    <tr key={invoice.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        <code>{invoice.invoiceNumber}</code>
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
                        {invoice.dueDate
                          ? new Date(invoice.dueDate).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                        {invoice.totalAmount.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 600 }}>
                        {invoice.amountPaid.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          color: invoice.amountDue > 0 ? '#d97706' : '#16a34a',
                          fontWeight: 700,
                        }}
                      >
                        {invoice.amountDue.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          {invoice.amountDue > 0 && canCreatePayment && (
                            <button
                              onClick={() => handleOpenPaymentModal(invoice)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #16a34a',
                                backgroundColor: '#f0fdf4',
                                color: '#15803d',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              💳 Encaisser
                            </button>
                          )}

                          {canWrite && (
                            <button
                              onClick={() => handleOpenEditModal(invoice)}
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

                          {canDelete && invoice.status === 'DRAFT' && (
                            <button
                              onClick={() => handleDeleteInvoice(invoice.id)}
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

        {/* Modals */}
        <InvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          onSave={handleSaveInvoice}
          initialData={editingInvoice}
          customers={customers}
          products={products}
        />

        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          onSave={handleSavePayment}
          invoice={payingInvoice}
        />
      </div>
    </PermissionGuard>
  );
}
