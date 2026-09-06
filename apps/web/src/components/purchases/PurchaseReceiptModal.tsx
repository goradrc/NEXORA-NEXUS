'use client';

import React, { useState, useEffect } from 'react';
import {
  PurchaseOrderDto,
  ProductServiceDto,
  CreatePurchaseReceiptDto,
  CreatePurchaseReceiptLineDto,
} from '@nexora/nexus';

interface PurchaseReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dto: CreatePurchaseReceiptDto) => Promise<void>;
  purchaseOrder: PurchaseOrderDto | null;
  catalogItems: ProductServiceDto[];
}

export function PurchaseReceiptModal({
  isOpen,
  onClose,
  onSave,
  purchaseOrder,
  catalogItems,
}: PurchaseReceiptModalProps) {
  const [lines, setLines] = useState<{ lineItemId: string; quantityReceived: number; maxRemaining: number }[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (purchaseOrder && isOpen) {
      setNotes('');
      setErrorMessage(null);

      const initialLines = purchaseOrder.lineItems.map((line) => {
        const remaining = line.quantityRemaining ?? line.quantity;
        return {
          lineItemId: line.id,
          quantityReceived: remaining, // Pre-fill with remaining quantity
          maxRemaining: remaining,
        };
      });
      setLines(initialLines);
    }
  }, [purchaseOrder, isOpen]);

  if (!isOpen || !purchaseOrder) return null;

  const handleQuantityChange = (lineItemId: string, value: number) => {
    setLines((prev) =>
      prev.map((l) => (l.lineItemId === lineItemId ? { ...l, quantityReceived: value } : l))
    );
  };

  const handleReceiveAll = () => {
    setLines((prev) =>
      prev.map((l) => ({ ...l, quantityReceived: l.maxRemaining }))
    );
  };

  const getItemInfo = (productServiceId: string) => {
    const item = catalogItems.find((c) => c.id === productServiceId);
    return item ? { name: item.name, type: item.type, unit: item.unit || 'PCE' } : { name: 'Article', type: 'PRODUCT', unit: 'PCE' };
  };

  // Validation
  let hasOverReceipt = false;
  let hasValidQuantity = false;

  for (const l of lines) {
    if (l.quantityReceived > l.maxRemaining + 0.0001) {
      hasOverReceipt = true;
    }
    if (l.quantityReceived > 0) {
      hasValidQuantity = true;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (hasOverReceipt) {
      setErrorMessage('La quantité à recevoir ne peut pas dépasser le reliquat restant.');
      return;
    }

    if (!hasValidQuantity) {
      setErrorMessage('Veuillez saisir au moins une quantité supérieure à 0 à réceptionner.');
      return;
    }

    const linesToSubmit: CreatePurchaseReceiptLineDto[] = lines
      .filter((l) => l.quantityReceived > 0)
      .map((l) => ({
        lineItemId: l.lineItemId,
        quantityReceived: Number(l.quantityReceived),
      }));

    const dto: CreatePurchaseReceiptDto = {
      idempotencyKey: `receipt-${purchaseOrder.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      notes,
      lines: linesToSubmit,
    };

    setSubmitting(true);
    try {
      await onSave(dto);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de l\'enregistrement de la réception.');
    } finally {
      setSubmitting(false);
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
          padding: 24,
          maxWidth: 780,
          width: '100%',
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
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
              Réceptionner la commande {purchaseOrder.poNumber}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
              Saisissez les quantités réellement livrées pour générer le Bon de Réception et mettre à jour le stock.
            </p>
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

        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              color: '#991b1b',
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
              Lignes de la commande ({purchaseOrder.lineItems.length})
            </span>
            <button
              type="button"
              onClick={handleReceiveAll}
              style={{
                backgroundColor: '#f1f5f9',
                color: '#0284c7',
                border: '1px solid #bae6fd',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⚡ Tout recevoir (Remplir reliquat)
            </button>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '8px 12px' }}>Article</th>
                  <th style={{ padding: '8px 12px', width: 90 }}>Type</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', width: 90 }}>Commandé</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', width: 90 }}>Déjà Reçu</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', width: 90 }}>Restant</th>
                  <th style={{ padding: '8px 12px', width: 130, textAlign: 'right' }}>Qté à Recevoir</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrder.lineItems.map((line) => {
                  const itemInfo = getItemInfo(line.productServiceId);
                  const lineForm = lines.find((l) => l.lineItemId === line.id);
                  const qtyReceivedInput = lineForm ? lineForm.quantityReceived : 0;
                  const alreadyReceived = line.quantityReceived ?? 0;
                  const remaining = line.quantityRemaining ?? line.quantity;
                  const isOver = qtyReceivedInput > remaining;

                  return (
                    <tr key={line.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                        {line.description || itemInfo.name}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            backgroundColor: itemInfo.type === 'PRODUCT' ? '#e0f2fe' : '#f1f5f9',
                            color: itemInfo.type === 'PRODUCT' ? '#0369a1' : '#475569',
                          }}
                        >
                          {itemInfo.type === 'PRODUCT' ? 'PRODUIT' : 'SERVICE'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                        {line.quantity} {itemInfo.unit}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>
                        {alreadyReceived} {itemInfo.unit}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 700 }}>
                        {remaining} {itemInfo.unit}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          step="any"
                          value={qtyReceivedInput}
                          onChange={(e) =>
                            handleQuantityChange(line.id, parseFloat(e.target.value) || 0)
                          }
                          style={{
                            width: 100,
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: isOver ? '2px solid #ef4444' : '1px solid #cbd5e1',
                            backgroundColor: isOver ? '#fef2f2' : '#ffffff',
                            color: isOver ? '#991b1b' : '#0f172a',
                            fontWeight: 700,
                            textAlign: 'right',
                          }}
                        />
                        {isOver && (
                          <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>
                            Dépassement ({remaining} max)
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Remarques / Référence Bon de Livraison Fournisseur
            </label>
            <input
              type="text"
              placeholder="Ex: Livré par le transporteur X (BL n° 98765)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 13,
              }}
            />
          </div>

          {/* Actions */}
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
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || hasOverReceipt || !hasValidQuantity}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: hasOverReceipt || !hasValidQuantity ? '#94a3b8' : '#16a34a',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting || hasOverReceipt || !hasValidQuantity ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Validation...' : 'Confirmer la Réception'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
