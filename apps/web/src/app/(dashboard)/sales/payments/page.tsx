'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PermissionGuard } from '../../../../components/ui/PermissionGuard';
import { usePermissions } from '../../../../hooks/usePermissions';
import {
  LocalPayment,
  LocalInvoice,
  LocalCustomer,
  localDb,
} from '../../../../offline/db';

export default function PaymentsPage() {
  const canRead = usePermissions('nexus:payments:read');

  const [payments, setPayments] = useState<LocalPayment[]>([]);
  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');

  const loadData = () => {
    setPayments([...localDb.payments]);
    setInvoices([...localDb.invoices]);
    setCustomers([...localDb.customers]);
  };

  useEffect(() => {
    loadData();
  }, []);

  const invoiceMap = useMemo(() => {
    const map = new Map<string, LocalInvoice>();
    invoices.forEach((i) => map.set(i.id, i));
    return map;
  }, [invoices]);

  const customerMap = useMemo(() => {
    const map = new Map<string, LocalCustomer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const invoice = invoiceMap.get(payment.invoiceId);
      const customer = customerMap.get(payment.customerId);

      const matchesSearch =
        payment.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (invoice && invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (customer && customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (payment.referenceCode && payment.referenceCode.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesMethod =
        selectedMethod === 'ALL' || payment.paymentMethod === selectedMethod;

      return matchesSearch && matchesMethod;
    });
  }, [payments, searchTerm, selectedMethod, invoiceMap, customerMap]);

  const totalCollected = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'BANK_TRANSFER':
        return 'Virement Bancaire';
      case 'CARD':
        return 'Carte Bancaire';
      case 'CASH':
        return 'Espèces';
      case 'CHECK':
        return 'Chèque';
      case 'MOBILE_MONEY':
        return 'Mobile Money';
      default:
        return method;
    }
  };

  if (!canRead) {
    return (
      <PermissionGuard permission="nexus:payments:read">
        <div>Accès non autorisé aux Règlements.</div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="nexus:payments:read">
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
              💳 Historique des Encaissements
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Traçabilité et audit des règlements clients reçus
            </p>
          </div>

          <div
            style={{
              padding: '10px 18px',
              backgroundColor: '#f0fdf4',
              borderRadius: 8,
              border: '1px solid #bbf7d0',
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>
              TOTAL CUMULÉ ENCAISSÉ
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>
              {totalCollected.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
            placeholder="Rechercher par N° règlement, N° facture, client ou réf..."
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
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  N° RÈGLEMENT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  DATE ENCAISSEMENT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  N° FACTURE
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  CLIENT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  MODE DE PAIEMENT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  RÉFÉRENCE PIÈCE
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
                  MONTANT ENCAISSÉ
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Aucun règlement trouvé.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const invoice = invoiceMap.get(payment.invoiceId);
                  const cust = customerMap.get(payment.customerId);

                  return (
                    <tr key={payment.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        <code>{payment.paymentNumber}</code>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {new Date(payment.paymentDate).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0284c7' }}>
                        {invoice ? invoice.invoiceNumber : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {cust ? cust.name : 'Client Inconnu'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                          }}
                        >
                          {getMethodLabel(payment.paymentMethod)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#64748b' }}>
                        {payment.referenceCode || '—'}
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
                        {payment.amount.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
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
