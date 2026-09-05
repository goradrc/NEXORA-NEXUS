'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import { localDb, LocalInvoice, LocalCustomer, LocalProduct, LocalPayment } from '../../../../offline/db';
import { InvoiceModal } from '../../../../components/sales/InvoiceModal';
import { PaymentModal } from '../../../../components/sales/PaymentModal';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';

export default function InvoicesPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const canCreate = usePermissions('nexus:invoices:create');
  const canUpdate = usePermissions('nexus:invoices:update');
  const canDelete = usePermissions('nexus:invoices:delete');
  const canCreatePayment = usePermissions('nexus:payments:create');

  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<LocalInvoice | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<LocalInvoice | null>(null);

  useEffect(() => {
    const orgInvoices = localDb.invoices.filter((i) => i.organizationId === orgId);
    const orgCustomers = localDb.customers.filter((c) => c.organizationId === orgId);
    const orgProducts = localDb.products.filter((p) => p.organizationId === orgId);

    setInvoices([...orgInvoices]);
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

  const filteredInvoices = useMemo(() => {
    let result = invoices;

    if (selectedStatus !== 'ALL') {
      result = result.filter((i) => i.status === selectedStatus);
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;

    return result.filter((i) => {
      const cust = customerMap.get(i.customerId);
      const custName = cust ? cust.name.toLowerCase() : '';
      return i.invoiceNumber.toLowerCase().includes(term) || custName.includes(term);
    });
  }, [invoices, selectedStatus, searchTerm, customerMap]);

  // Overall financial KPIs
  const totalInvoiced = useMemo(() => invoices.reduce((sum, i) => sum + i.totalAmount, 0), [invoices]);
  const totalCollected = useMemo(() => invoices.reduce((sum, i) => sum + (i.amountPaid || 0), 0), [invoices]);
  const totalReceivables = useMemo(() => invoices.reduce((sum, i) => sum + (i.amountDue || 0), 0), [invoices]);

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

  const handleSaveInvoice = async (data: Partial<LocalInvoice>) => {
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

    if (editingInvoice) {
      const isDraft = editingInvoice.status === 'DRAFT';
      const amountPaid = editingInvoice.amountPaid || 0;
      const amountDue = Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));

      const updated: LocalInvoice = {
        ...editingInvoice,
        customerId: isDraft ? data.customerId || editingInvoice.customerId : editingInvoice.customerId,
        status: data.status || editingInvoice.status,
        dueDate: data.dueDate || editingInvoice.dueDate,
        totalUntaxed,
        totalTax,
        totalAmount,
        amountDue,
        lineItems: isDraft ? lines : editingInvoice.lineItems,
      };

      const idx = localDb.invoices.findIndex((i) => i.id === editingInvoice.id && i.organizationId === orgId);
      if (idx !== -1) {
        localDb.invoices[idx] = updated;
      }

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Invoice',
        entityId: updated.id,
        operation: 'UPDATE',
        payload: updated,
      });
    } else {
      const count = localDb.invoices.filter((i) => i.organizationId === orgId).length;
      const invoiceNumber = `TEMP-FAC-${(count + 1).toString().padStart(4, '0')}`;
      const newInvoice: LocalInvoice = {
        id: `inv-${crypto.randomUUID()}`,
        organizationId: orgId,
        customerId: data.customerId || (customers[0]?.id || 'cli-001'),
        invoiceNumber,
        status: (data.status as any) || 'UNPAID',
        totalUntaxed,
        totalTax,
        totalAmount,
        amountPaid: 0,
        amountDue: totalAmount,
        dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        lineItems: lines,
      };

      localDb.invoices.push(newInvoice);

      // Update customer balance (increase receivable balance)
      const custIdx = localDb.customers.findIndex((c) => c.id === newInvoice.customerId);
      if (custIdx !== -1) {
        localDb.customers[custIdx].balance = Number(
          ((localDb.customers[custIdx].balance || 0) + totalAmount).toFixed(2)
        );
      }

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Invoice',
        entityId: newInvoice.id,
        operation: 'INSERT',
        payload: newInvoice,
      });
    }

    const refreshed = localDb.invoices.filter((i) => i.organizationId === orgId);
    setInvoices([...refreshed]);
    setIsInvoiceModalOpen(false);
  };

  const handleSavePayment = async (data: Partial<LocalPayment>) => {
    if (!payingInvoice) return;

    const paymentAmount = Number((data.amount || 0).toFixed(2));
    if (paymentAmount <= 0) {
      alert('Le montant du paiement doit être supérieur à 0.');
      return;
    }

    if (paymentAmount > payingInvoice.amountDue + 0.001) {
      alert(`Sur-paiement rejeté ! Le montant (${paymentAmount} €) dépasse le solde dû (${payingInvoice.amountDue} €).`);
      return;
    }

    const newAmountPaid = Number(((payingInvoice.amountPaid || 0) + paymentAmount).toFixed(2));
    const newAmountDue = Math.max(0, Number((payingInvoice.totalAmount - newAmountPaid).toFixed(2)));
    const newStatus = newAmountDue <= 0.001 ? 'PAID' : 'PARTIAL';

    const updatedInvoice: LocalInvoice = {
      ...payingInvoice,
      amountPaid: newAmountPaid,
      amountDue: newAmountDue,
      status: newStatus,
    };

    const invIdx = localDb.invoices.findIndex((i) => i.id === payingInvoice.id);
    if (invIdx !== -1) localDb.invoices[invIdx] = updatedInvoice;

    // Create payment
    const payCount = localDb.payments.filter((p) => p.organizationId === orgId).length;
    const newPayment: LocalPayment = {
      id: `pay-${crypto.randomUUID()}`,
      organizationId: orgId,
      customerId: payingInvoice.customerId,
      invoiceId: payingInvoice.id,
      paymentNumber: `TEMP-PAY-${(payCount + 1).toString().padStart(4, '0')}`,
      amount: paymentAmount,
      paymentMethod: data.paymentMethod || 'CASH',
      referenceCode: data.referenceCode || '',
      paymentDate: data.paymentDate || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    localDb.payments.push(newPayment);

    // Update customer receivable balance
    const custIdx = localDb.customers.findIndex((c) => c.id === payingInvoice.customerId);
    if (custIdx !== -1) {
      localDb.customers[custIdx].balance = Math.max(
        0,
        Number(((localDb.customers[custIdx].balance || 0) - paymentAmount).toFixed(2))
      );
    }

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Invoice',
      entityId: updatedInvoice.id,
      operation: 'UPDATE',
      payload: updatedInvoice,
    });

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Payment',
      entityId: newPayment.id,
      operation: 'INSERT',
      payload: newPayment,
    });

    const refreshed = localDb.invoices.filter((i) => i.organizationId === orgId);
    setInvoices([...refreshed]);
    setIsPaymentModalOpen(false);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const target = invoices.find((i) => i.id === invoiceId);
    if (target && target.status !== 'DRAFT') {
      alert('Seules les factures en statut Brouillon (DRAFT) peuvent être supprimées.');
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer cette facture brouillon ?')) return;

    localDb.invoices = localDb.invoices.filter((i) => !(i.id === invoiceId && i.organizationId === orgId));

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Invoice',
      entityId: invoiceId,
      operation: 'DELETE',
      payload: { id: invoiceId },
    });

    const refreshed = localDb.invoices.filter((i) => i.organizationId === orgId);
    setInvoices([...refreshed]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Brouillon', bg: '#f1f5f9', color: '#475569' };
      case 'UNPAID':
        return { label: 'Non Payée', bg: '#fef2f2', color: '#dc2626' };
      case 'PARTIAL':
        return { label: 'Partiellement Payée', bg: '#fef3c7', color: '#b45309' };
      case 'PAID':
        return { label: 'Payée', bg: '#dcfce7', color: '#15803d' };
      case 'CANCELLED':
        return { label: 'Annulée', bg: '#f3f4f6', color: '#6b7280' };
      default:
        return { label: status, bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <PermissionGuard permission="nexus:invoices:read">
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
              Factures de Vente & Créances
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Émission des factures, suivi des règlements et créances pour{' '}
              <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
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
              <span>➕</span> Nouvelle Facture
            </button>
          )}
        </div>

        {/* KPI Summary Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Facturé</div>
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
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>N° FACTURE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>CLIENT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>STATUT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>ÉCHÉANCE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>TOTAL TTC</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>PAYÉ</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>RESTE DÛ</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>ACTIONS</th>
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
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{cust ? cust.name : 'Client Inconnu'}</div>
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
                        {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                        {invoice.totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 600 }}>
                        {invoice.amountPaid.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td style={{ padding: '14px 16px', color: invoice.amountDue > 0 ? '#d97706' : '#16a34a', fontWeight: 700 }}>
                        {invoice.amountDue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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

                          {canUpdate && (
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
