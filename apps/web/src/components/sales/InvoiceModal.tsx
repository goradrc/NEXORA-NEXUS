'use client';

import React, { useState, useEffect } from 'react';
import { LocalInvoice, LocalCustomer, LocalProduct, LocalLineItem } from '../../offline/db';
import { LineItemEditor } from './LineItemEditor';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoiceData: Partial<LocalInvoice>) => void;
  initialData?: LocalInvoice | null;
  customers: LocalCustomer[];
  products: LocalProduct[];
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  customers,
  products,
}) => {
  const [formData, setFormData] = useState<Partial<LocalInvoice>>({
    customerId: '',
    status: 'UNPAID',
    dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    lineItems: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        customerId: initialData.customerId || (customers[0]?.id || ''),
        status: initialData.status || 'UNPAID',
        dueDate: initialData.dueDate ? initialData.dueDate.split('T')[0] : '',
        lineItems: initialData.lineItems || [],
      });
    } else {
      const defaultProduct = products[0];
      const initialLine: LocalLineItem = defaultProduct
        ? {
            id: `line-${crypto.randomUUID()}`,
            productServiceId: defaultProduct.id,
            description: defaultProduct.name,
            quantity: 1,
            unitPrice: defaultProduct.salePrice,
            taxRate: defaultProduct.taxRate ?? 20,
            discountPercent: 0,
            totalPrice: defaultProduct.salePrice,
          }
        : {
            id: `line-${crypto.randomUUID()}`,
            productServiceId: 'custom',
            description: 'Nouvelle prestation',
            quantity: 1,
            unitPrice: 0,
            taxRate: 20,
            discountPercent: 0,
            totalPrice: 0,
          };

      setFormData({
        customerId: customers[0]?.id || '',
        status: 'UNPAID',
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
        lineItems: [initialLine],
      });
    }
    setErrors({});
  }, [initialData, isOpen, customers, products]);

  if (!isOpen) return null;

  const isIssuedAndLocked = !!initialData && initialData.status !== 'DRAFT';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.customerId) {
      newErrors.customerId = 'Veuillez sélectionner un client.';
    }

    if (!formData.lineItems || formData.lineItems.length === 0) {
      newErrors.lineItems = 'La facture doit comporter au moins une ligne d\'article.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave(formData);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 8,
          width: '100%',
          maxWidth: 820,
          padding: 24,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {initialData ? `Facture : ${initialData.invoiceNumber}` : 'Nouvelle Facture de Vente'}
            </h2>
            {isIssuedAndLocked && (
              <span style={{ fontSize: 12, color: '#0284c7', fontWeight: 600 }}>
                🔒 Facture émise (Contenu commercial immuable)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Client Destinataire *
              </label>
              <select
                disabled={isIssuedAndLocked}
                value={formData.customerId}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, customerId: e.target.value }));
                  if (errors.customerId) setErrors((prev) => ({ ...prev, customerId: '' }));
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${errors.customerId ? '#ef4444' : '#cbd5e1'}`,
                  fontSize: 14,
                  backgroundColor: isIssuedAndLocked ? '#f1f5f9' : '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">-- Sélectionner un client --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name} {c.companyName ? `(${c.companyName})` : ''}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'block' }}>
                  {errors.customerId}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Statut de la Facture
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as any,
                  }))
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                <option value="DRAFT">Brouillon (DRAFT)</option>
                <option value="UNPAID">Non Payée (UNPAID)</option>
                <option value="PARTIAL">Partiellement Payée (PARTIAL)</option>
                <option value="PAID">Payée (PAID)</option>
                <option value="CANCELLED">Annulée (CANCELLED)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Date d'Échéance de Règlement
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Line Item Editor */}
          <LineItemEditor
            lines={formData.lineItems || []}
            onChange={(updatedLines) => {
              if (isIssuedAndLocked) return;
              setFormData((prev) => ({ ...prev, lineItems: updatedLines }));
              if (errors.lineItems) setErrors((prev) => ({ ...prev, lineItems: '' }));
            }}
            products={products}
            readOnly={isIssuedAndLocked}
          />
          {errors.lineItems && (
            <span style={{ fontSize: 12, color: '#ef4444', marginBottom: 12, display: 'block' }}>
              {errors.lineItems}
            </span>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
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
              Fermer
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {initialData ? 'Enregistrer les modifications' : 'Émettre la Facture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
