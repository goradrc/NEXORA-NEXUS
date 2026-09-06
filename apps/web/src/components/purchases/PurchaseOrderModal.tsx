'use client';

import React, { useState, useEffect } from 'react';
import {
  PurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreatePurchaseOrderLineItemDto,
  SupplierDto,
  ProductServiceDto,
} from '@nexora/nexus';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreatePurchaseOrderDto) => Promise<void>;
  initialData?: PurchaseOrderDto | null;
  suppliers: SupplierDto[];
  catalogItems: ProductServiceDto[];
}

interface FormLineItem {
  productServiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  suppliers,
  catalogItems,
}) => {
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<FormLineItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setSupplierId(initialData.supplierId || '');
      setExpectedDate(initialData.expectedDate ? initialData.expectedDate.slice(0, 10) : '');
      setNotes(initialData.notes || '');
      if (initialData.lineItems && initialData.lineItems.length > 0) {
        setLineItems(
          initialData.lineItems.map((line) => ({
            productServiceId: line.productServiceId,
            description: line.description || '',
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
          }))
        );
      } else {
        setLineItems([]);
      }
    } else {
      setSupplierId(suppliers.length > 0 ? suppliers[0].id : '');
      setExpectedDate('');
      setNotes('');
      setLineItems([]);
    }
    setError(null);
  }, [initialData, isOpen, suppliers]);

  if (!isOpen) return null;

  const handleAddLine = () => {
    if (catalogItems.length === 0) {
      setError('Aucun article disponible dans le catalogue.');
      return;
    }
    const defaultItem = catalogItems[0];
    setLineItems((prev) => [
      ...prev,
      {
        productServiceId: defaultItem.id,
        description: defaultItem.name,
        quantity: 1,
        unitPrice: defaultItem.purchaseCost || defaultItem.salePrice || 0,
        taxRate: defaultItem.taxRate ?? 20,
      },
    ]);
  };

  const handleLineChange = (index: number, field: keyof FormLineItem, value: any) => {
    setLineItems((prev) => {
      const updated = [...prev];
      if (field === 'productServiceId') {
        const product = catalogItems.find((p) => p.id === value);
        if (product) {
          updated[index] = {
            ...updated[index],
            productServiceId: product.id,
            description: product.name,
            unitPrice: product.purchaseCost || product.salePrice || 0,
            taxRate: product.taxRate ?? 20,
          };
        }
      } else if (field === 'quantity') {
        updated[index] = { ...updated[index], quantity: Math.max(1, Number(value) || 1) };
      } else if (field === 'unitPrice') {
        updated[index] = { ...updated[index], unitPrice: Math.max(0, Number(value) || 0) };
      } else if (field === 'taxRate') {
        updated[index] = { ...updated[index], taxRate: Math.max(0, Number(value) || 0) };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleRemoveLine = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const totalUntaxed = lineItems.reduce((acc, line) => acc + line.quantity * line.unitPrice, 0);
  const totalTax = lineItems.reduce(
    (acc, line) => acc + line.quantity * line.unitPrice * (line.taxRate / 100),
    0
  );
  const totalAmount = totalUntaxed + totalTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supplierId) {
      setError('Veuillez sélectionner un fournisseur.');
      return;
    }

    if (lineItems.length === 0) {
      setError('Au moins un article est requis pour valider la commande.');
      return;
    }

    for (let i = 0; i < lineItems.length; i++) {
      if (lineItems[i].quantity <= 0) {
        setError(`Ligne ${i + 1}: La quantité doit être supérieure à 0.`);
        return;
      }
      if (lineItems[i].unitPrice < 0) {
        setError(`Ligne ${i + 1}: Le prix unitaire ne peut pas être négatif.`);
        return;
      }
    }

    const payload: CreatePurchaseOrderDto = {
      supplierId,
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      lineItems: lineItems.map((l) => ({
        productServiceId: l.productServiceId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      })),
    };

    try {
      setIsSubmitting(true);
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de l\'enregistrement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: 820,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            {initialData ? `Modifier la Commande ${initialData.poNumber}` : 'Nouvelle Commande d\'Achat'}
          </h3>
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

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  color: '#991b1b',
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            {/* General Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Fournisseur *
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    backgroundColor: '#fff',
                  }}
                >
                  <option value="" disabled>-- Sélectionner un fournisseur --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Date de Livraison Prévue
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Notes / Remarques
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Instructions particulières de commande..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Line Items Table */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                  Lignes de Commande
                </h4>
                <button
                  type="button"
                  onClick={handleAddLine}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Ajouter un article
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    backgroundColor: '#f8fafc',
                    borderRadius: 6,
                    border: '1px dashed #cbd5e1',
                    color: '#64748b',
                    fontSize: 14,
                  }}
                >
                  Aucun article ajouté. Cliquez sur "+ Ajouter un article" pour commencer.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '8px 10px', width: '30%' }}>Article</th>
                        <th style={{ padding: '8px 10px', width: '15%' }}>Qté</th>
                        <th style={{ padding: '8px 10px', width: '20%' }}>Prix Unitaire HT</th>
                        <th style={{ padding: '8px 10px', width: '15%' }}>TVA %</th>
                        <th style={{ padding: '8px 10px', width: '15%', textAlign: 'right' }}>Total HT</th>
                        <th style={{ padding: '8px 10px', width: '5%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((line, idx) => {
                        const lineTotal = line.quantity * line.unitPrice;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                value={line.productServiceId}
                                onChange={(e) => handleLineChange(idx, 'productServiceId', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  fontSize: 13,
                                }}
                              >
                                {catalogItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    [{item.reference}] {item.name} ({item.type === 'SERVICE' ? 'Service' : 'Produit'})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  fontSize: 13,
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={line.unitPrice}
                                onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  fontSize: 13,
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                value={line.taxRate}
                                onChange={(e) => handleLineChange(idx, 'taxRate', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  fontSize: 13,
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                              {lineTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: 16,
                                  fontWeight: 'bold',
                                }}
                                title="Supprimer la ligne"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Calculations Summary Card */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignSelf: 'flex-end',
                minWidth: 260,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                <span>Total HT :</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {totalUntaxed.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                <span>Total TVA :</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {totalTax.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#0284c7',
                  borderTop: '1px solid #cbd5e1',
                  paddingTop: 8,
                  marginTop: 4,
                }}
              >
                <span>Total TTC :</span>
                <span>
                  {totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              backgroundColor: '#f8fafc',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '9px 16px',
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
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '9px 20px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Enregistrement...' : initialData ? 'Enregistrer' : 'Créer la commande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
