'use client';

import React, { useState, useEffect } from 'react';
import { LocalQuote, LocalCustomer, LocalProduct, LocalLineItem } from '../../offline/db';
import { LineItemEditor } from './LineItemEditor';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (quoteData: Partial<LocalQuote>) => void;
  initialData?: LocalQuote | null;
  customers: LocalCustomer[];
  products: LocalProduct[];
}

export const QuoteModal: React.FC<QuoteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  customers,
  products,
}) => {
  const [formData, setFormData] = useState<Partial<LocalQuote>>({
    customerId: '',
    status: 'DRAFT',
    validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    lineItems: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        customerId: initialData.customerId || customers[0]?.id || '',
        status: initialData.status || 'DRAFT',
        validUntil: initialData.validUntil ? initialData.validUntil.split('T')[0] : '',
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
            productServiceId: undefined,
            description: 'Nouvelle prestation',
            quantity: 1,
            unitPrice: 0,
            taxRate: 20,
            discountPercent: 0,
            totalPrice: 0,
          };

      setFormData({
        customerId: customers[0]?.id || '',
        status: 'DRAFT',
        validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
        lineItems: [initialLine],
      });
    }
    setErrors({});
  }, [initialData, isOpen, customers, products]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.customerId) {
      newErrors.customerId = 'Veuillez sélectionner un client.';
    }

    if (!formData.lineItems || formData.lineItems.length === 0) {
      newErrors.lineItems = "Le devis doit comporter au moins une ligne d'article.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave(formData);
  };

  const isReadOnly = initialData?.status === 'CONVERTED';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? `Devis / Proforma : ${initialData.quoteNumber}` : 'Nouveau Devis Commercial'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {!isReadOnly && (
            <Button variant="primary" onClick={handleSubmit}>
              {initialData ? 'Enregistrer les modifications' : 'Créer le Devis'}
            </Button>
          )}
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label
              htmlFor="quote-customer-select"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Client Destinataire *
            </label>
            <select
              id="quote-customer-select"
              disabled={isReadOnly}
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
                backgroundColor: '#ffffff',
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
            <label
              htmlFor="quote-status-select"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Statut du Devis
            </label>
            <select
              id="quote-status-select"
              disabled={isReadOnly}
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
              <option value="SENT">Envoyé au client (SENT)</option>
              <option value="ACCEPTED">Accepté par le client (ACCEPTED)</option>
              <option value="REJECTED">Refusé (REJECTED)</option>
              {initialData?.status === 'CONVERTED' && <option value="CONVERTED">Converti en Facture</option>}
            </select>
          </div>

          <div>
            <label
              htmlFor="quote-validity-date"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Date Limite de Validité
            </label>
            <input
              id="quote-validity-date"
              type="date"
              disabled={isReadOnly}
              value={formData.validUntil}
              onChange={(e) => setFormData((prev) => ({ ...prev, validUntil: e.target.value }))}
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
            setFormData((prev) => ({ ...prev, lineItems: updatedLines }));
            if (errors.lineItems) setErrors((prev) => ({ ...prev, lineItems: '' }));
          }}
          products={products}
          readOnly={isReadOnly}
        />
        {errors.lineItems && (
          <span style={{ fontSize: 12, color: '#ef4444', marginBottom: 12, display: 'block' }}>
            {errors.lineItems}
          </span>
        )}
      </form>
    </Modal>
  );
};
