'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import { localDb, LocalPayment, LocalInvoice, LocalCustomer } from '../../../../offline/db';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';

export default function PaymentsPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const [payments, setPayments] = useState<LocalPayment[]>([]);
  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');

  useEffect(() => {
    const orgPayments = localDb.payments.filter((p) => p.organizationId === orgId);
    const orgInvoices = localDb.invoices.filter((i) => i.organizationId === orgId);
    const orgCustomers = localDb.customers.filter((c) => c.organizationId === orgId);

    setPayments([...orgPayments]);
    setInvoices([...orgInvoices]);
    setCustomers([...orgCustomers]);
  }, [orgId]);

  const invoiceMap = useMemo(() => {
    const map = new Map<string, LocalInvoice>();
    for (const inv of invoices) map.set(inv.id, inv);
    return map;
  }, [invoices]);

  const customerMap = useMemo(() => {
    const map = new Map<string, LocalCustomer>();
    for (const cust of customers) map.set(cust.id, cust);
    return map;
  }, [customers]);

  const filteredPayments = useMemo(() => {
    let result = payments;

    if (selectedMethod !== 'ALL') {
      result = result.filter((p) => p.paymentMethod === selectedMethod);
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;

    return result.filter((p) => {
      const inv = invoiceMap.get(p.invoiceId);
      const cust = customerMap.get(p.customerId);
      const invNum = inv ? inv.invoiceNumber.toLowerCase() : '';
      const custName = cust ? cust.name.toLowerCase() : '';
      const ref = (p.referenceCode || '').toLowerCase();

      return (
        p.paymentNumber.toLowerCase().includes(term) ||
        invNum.includes(term) ||
        custName.includes(term) ||
        ref.includes(term)
      );
    });
  }, [payments, selectedMethod, searchTerm, invoiceMap, customerMap]);

  const totalCollectedAmount = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'BANK_TRANSFER':
        return { label: 'Virement Bancaire', bg: '#e0f2fe', color: '#0369a1' };
      case 'CARD':
        return { label: 'Carte Bancaire', bg: '#f0fdf4', color: '#15803d' };
      case 'CASH':
        return { label: 'Espèces', bg: '#fef3c7', color: '#b45309' };
      case 'CHECK':
        return { label: 'Chèque', bg: '#f3e8ff', color: '#7e22ce' };
      case 'MOBILE_MONEY':
        return { label: 'Mobile Money', bg: '#ffedd5', color: '#c2410c' };
      default:
        return { label: method, bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <PermissionGuard permission="nexus:payments:read">
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
              Historique des Encaissements & Règlements
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Traçabilité complète des encaissements enregistrés pour{' '}
              <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
            </p>
          </div>
        </div>

        {/* Financial KPI */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Encaissements Réalisés</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
              {totalCollectedAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>

          <div style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Nombre de Règlements</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {payments.length}
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
            placeholder="Rechercher par N° règlement, facture, client ou référence..."
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
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">Tous les Modes de Paiement</option>
            <option value="BANK_TRANSFER">Virement Bancaire</option>
            <option value="CARD">Carte Bancaire</option>
            <option value="CASH">Espèces</option>
            <option value="CHECK">Chèque</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
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
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>N° RÈGLEMENT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>FACTURE ASSOCIÉE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>CLIENT</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>MODE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>RÉFÉRENCE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>DATE</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>MONTANT ENCAISSÉ</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Aucun règlement enregistré.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const inv = invoiceMap.get(payment.invoiceId);
                  const cust = customerMap.get(payment.customerId);
                  const badge = getMethodBadge(payment.paymentMethod);

                  return (
                    <tr key={payment.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        <code>{payment.paymentNumber}</code>
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0284c7' }}>
                        {inv ? <code>{inv.invoiceNumber}</code> : 'Facture Inconnue'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        {cust ? cust.name : 'Client Inconnu'}
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
                      <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>
                        {payment.referenceCode || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {new Date(payment.paymentDate).toLocaleDateString('fr-FR')}
                      </td>
                      <td
                        style={{
                          padding: '14px 16px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#16a34a',
                          fontSize: 15,
                        }}
                      >
                        +{payment.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
