'use client';

import React, { useState, useEffect } from 'react';
import { LocalCategory } from '../../offline/db';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (categoryData: Partial<LocalCategory>) => void;
  initialData?: LocalCategory | null;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<LocalCategory>>({
    name: '',
    type: 'PRODUCT',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        type: initialData.type || 'PRODUCT',
      });
    } else {
      setFormData({
        name: '',
        type: 'PRODUCT',
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Le nom de la catégorie est obligatoire.';
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
          maxWidth: 440,
          padding: 24,
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
            {initialData ? 'Modifier la Catégorie' : 'Nouvelle Catégorie'}
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
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              Nom de la Catégorie *
            </label>
            <input
              type="text"
              placeholder="ex: Électronique, Consommables..."
              value={formData.name}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, name: e.target.value }));
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
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

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
              Type de Catégorie
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  type: e.target.value as 'PRODUCT' | 'SERVICE' | 'EXPENSE',
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
              <option value="PRODUCT">Produit Physique</option>
              <option value="SERVICE">Prestation / Service</option>
              <option value="EXPENSE">Dépense / Charge</option>
            </select>
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
              {initialData ? 'Enregistrer' : 'Créer la catégorie'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
