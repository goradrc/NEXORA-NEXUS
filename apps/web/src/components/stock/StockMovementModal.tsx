'use client';

import React, { useState, useEffect } from 'react';
import { LocalProduct } from '../../offline/db';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    productId: string;
    actionType: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reason: string;
  }) => void;
  products: LocalProduct[];
  selectedProduct?: LocalProduct | null;
  initialAction?: 'IN' | 'OUT' | 'ADJUSTMENT';
}

export const StockMovementModal: React.FC<StockMovementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  products,
  selectedProduct,
  initialAction = 'IN',
}) => {
  const stockableProducts = products.filter((p) => p.type === 'PRODUCT');

  const [productId, setProductId] = useState<string>('');
  const [actionType, setActionType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>(initialAction);
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProduct) {
      setProductId(selectedProduct.id);
    } else if (stockableProducts.length > 0 && !productId) {
      setProductId(stockableProducts[0].id);
    }
    setActionType(initialAction);
    setQuantity(1);
    setReason('');
    setError(null);
  }, [isOpen, selectedProduct, initialAction]);

  if (!isOpen) return null;

  const currentProduct = stockableProducts.find((p) => p.id === productId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productId) {
      setError('Veuillez sélectionner un produit stockable.');
      return;
    }

    if (!currentProduct) {
      setError('Produit introuvable.');
      return;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('La quantité doit être un nombre strictement supérieur à 0.');
      return;
    }

    // Anti-negative stock validation for manual OUT operations
    if (actionType === 'OUT' && qty > currentProduct.currentStock) {
      setError(
        `Stock insuffisant ! Le stock disponible est de ${currentProduct.currentStock} ${currentProduct.unit}, impossible de retirer ${qty} ${currentProduct.unit}.`
      );
      return;
    }

    onSave({
      productId,
      actionType,
      quantity: qty,
      reason,
    });
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
          maxWidth: 520,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            📦 Enregistrer un Mouvement de Stock
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
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Product Selection */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Produit Stockable *
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              disabled={!!selectedProduct}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                backgroundColor: !!selectedProduct ? '#f1f5f9' : '#ffffff',
              }}
            >
              {stockableProducts.length === 0 ? (
                <option value="">Aucun produit stockable disponible</option>
              ) : (
                stockableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.reference}] {p.name} (Stock actuel : {p.currentStock} {p.unit})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Current Stock Recap Card */}
          {currentProduct && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                backgroundColor: '#f8fafc',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
              }}
            >
              <span style={{ color: '#64748b' }}>Stock Actuel Disponible :</span>
              <span style={{ fontWeight: 800, color: currentProduct.currentStock <= currentProduct.minStockAlert ? '#dc2626' : '#16a34a' }}>
                {currentProduct.currentStock} {currentProduct.unit}
              </span>
            </div>
          )}

          {/* Action Type */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Type d'Opération *
            </label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                backgroundColor: '#ffffff',
              }}
            >
              <option value="IN">➕ Entrée de Stock (Réception / Approvisionnement)</option>
              <option value="OUT">➖ Sortie de Stock (Retrait / Perte)</option>
              <option value="ADJUSTMENT">⚖️ Ajustement d'Inventaire (Nouveau Stock Physique)</option>
            </select>
          </div>

          {/* Quantity Input */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              {actionType === 'ADJUSTMENT'
                ? 'Nouvelle Quantité Physique Constatée *'
                : 'Quantité à ajouter / retirer *'}
            </label>
            <input
              type="number"
              step="1"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                fontWeight: 700,
              }}
            />
          </div>

          {/* Reason */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Motif / Justification du mouvement
            </label>
            <input
              type="text"
              placeholder="ex: Réception BL-849, Inventaire annuel, Casse..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
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
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: actionType === 'OUT' ? '#dc2626' : '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Valider le Mouvement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
