'use client';

import React, { useState, useEffect } from 'react';
import { LocalProduct, LocalCategory } from '../../offline/db';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: Partial<LocalProduct>) => void;
  initialData?: LocalProduct | null;
  categories: LocalCategory[];
  existingProducts: LocalProduct[];
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  categories,
  existingProducts,
}) => {
  const [formData, setFormData] = useState<Partial<LocalProduct>>({
    type: 'PRODUCT',
    reference: '',
    name: '',
    description: '',
    categoryId: '',
    salePrice: 0,
    purchaseCost: 0,
    taxRate: 20,
    currentStock: 0,
    minStockAlert: 5,
    unit: 'PCE',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        type: initialData.type || 'PRODUCT',
        reference: initialData.reference || '',
        name: initialData.name || '',
        description: initialData.description || '',
        categoryId: initialData.categoryId || (categories[0]?.id || ''),
        salePrice: initialData.salePrice || 0,
        purchaseCost: initialData.purchaseCost || 0,
        taxRate: initialData.taxRate ?? 20,
        currentStock: initialData.currentStock ?? 0,
        minStockAlert: initialData.minStockAlert ?? 5,
        unit: initialData.unit || 'PCE',
      });
    } else {
      setFormData({
        type: 'PRODUCT',
        reference: '',
        name: '',
        description: '',
        categoryId: categories[0]?.id || '',
        salePrice: 0,
        purchaseCost: 0,
        taxRate: 20,
        currentStock: 0,
        minStockAlert: 5,
        unit: 'PCE',
      });
    }
    setErrors({});
  }, [initialData, isOpen, categories]);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const val = type === 'number' ? parseFloat(value) || 0 : value;

    setFormData((prev) => ({ ...prev, [name]: val }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.reference?.trim()) {
      newErrors.reference = 'La référence SKU est obligatoire.';
    } else {
      // Local check for duplicate SKU on same device
      const duplicate = existingProducts.find(
        (p) =>
          p.reference.trim().toLowerCase() === formData.reference?.trim().toLowerCase() &&
          p.id !== initialData?.id
      );
      if (duplicate) {
        newErrors.reference = 'Ce SKU/Référence existe déjà sur cet appareil.';
      }
    }

    if (!formData.name?.trim()) {
      newErrors.name = 'Le nom de l\'article est obligatoire.';
    }

    if (!formData.categoryId) {
      newErrors.categoryId = 'Veuillez sélectionner une catégorie.';
    }

    if (formData.salePrice === undefined || formData.salePrice < 0) {
      newErrors.salePrice = 'Le prix de vente doit être positif ou nul.';
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
          maxWidth: 600,
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            {initialData ? 'Modifier l\'Article' : 'Nouveau Produit / Service'}
          </h2>
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
          {/* Type Article Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              Type d'Article *
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="type"
                  value="PRODUCT"
                  checked={formData.type === 'PRODUCT'}
                  onChange={handleChange}
                />
                📦 Produit Physique
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="type"
                  value="SERVICE"
                  checked={formData.type === 'SERVICE'}
                  onChange={handleChange}
                />
                🛠️ Service / Prestation
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Référence / SKU *
              </label>
              <input
                type="text"
                name="reference"
                placeholder="ex: SKU-100"
                value={formData.reference}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${errors.reference ? '#ef4444' : '#cbd5e1'}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              {errors.reference && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'block' }}>
                  {errors.reference}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Désignation / Nom *
              </label>
              <input
                type="text"
                name="name"
                placeholder="ex: Écran PC 27 pouces"
                value={formData.name}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${errors.name ? '#ef4444' : '#cbd5e1'}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              {errors.name && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'block' }}>
                  {errors.name}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Catégorie *
              </label>
              <select
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${errors.categoryId ? '#ef4444' : '#cbd5e1'}`,
                  fontSize: 14,
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">-- Sélectionner une catégorie --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.type})
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'block' }}>
                  {errors.categoryId}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Unité de Mesure
              </label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
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
                <option value="PCE">Pièce (PCE)</option>
                <option value="KG">Kilogramme (KG)</option>
                <option value="HEURE">Heure (H)</option>
                <option value="LITRE">Litre (L)</option>
                <option value="METRE">Mètre (M)</option>
                <option value="FORFAIT">Forfait</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Prix de Vente HT (€) *
              </label>
              <input
                type="number"
                step="0.01"
                name="salePrice"
                value={formData.salePrice}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${errors.salePrice ? '#ef4444' : '#cbd5e1'}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              {errors.salePrice && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'block' }}>
                  {errors.salePrice}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Coût d'Achat HT (€)
              </label>
              <input
                type="number"
                step="0.01"
                name="purchaseCost"
                value={formData.purchaseCost}
                onChange={handleChange}
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

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Taux de TVA (%)
              </label>
              <input
                type="number"
                step="0.1"
                name="taxRate"
                value={formData.taxRate}
                onChange={handleChange}
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

          {formData.type === 'PRODUCT' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Stock Actuel Initial
                </label>
                <input
                  type="number"
                  name="currentStock"
                  value={formData.currentStock}
                  onChange={handleChange}
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

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Seuil d'Alerte Stock Bas
                </label>
                <input
                  type="number"
                  name="minStockAlert"
                  value={formData.minStockAlert}
                  onChange={handleChange}
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
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              Description détaillée
            </label>
            <textarea
              name="description"
              rows={3}
              placeholder="Description technique ou commerciale..."
              value={formData.description}
              onChange={handleChange}
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
              {initialData ? 'Enregistrer' : 'Créer l\'article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
