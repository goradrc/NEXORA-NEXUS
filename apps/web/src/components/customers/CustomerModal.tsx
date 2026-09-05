'use client';

import React, { useState, useEffect } from 'react';
import { LocalCustomer } from '../../offline/db';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customerData: Partial<LocalCustomer>) => void;
  initialData?: LocalCustomer | null;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<LocalCustomer>>({
    code: '',
    name: '',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    taxNumber: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        code: initialData.code || '',
        name: initialData.name || '',
        companyName: initialData.companyName || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        city: initialData.city || '',
        taxNumber: initialData.taxNumber || '',
      });
    } else {
      setFormData({
        code: '',
        name: '',
        companyName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        taxNumber: '',
      });
    }
    setErrors({});
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Le nom du client est obligatoire.';
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
          maxWidth: 540,
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
            {initialData ? 'Modifier le Client' : 'Nouveau Client CRM'}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Code Client (Optionnel)
              </label>
              <input
                type="text"
                name="code"
                placeholder="Auto-généré si vide"
                value={formData.code}
                onChange={handleChange}
                disabled={!!initialData}
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
                Nom / Prénom *
              </label>
              <input
                type="text"
                name="name"
                placeholder="ex: Jean Dupont"
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
                Raison Sociale / Entreprise
              </label>
              <input
                type="text"
                name="companyName"
                placeholder="ex: Dupont Corp"
                value={formData.companyName}
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
                Numéro de Tél.
              </label>
              <input
                type="text"
                name="phone"
                placeholder="ex: +33 6 12 34 56 78"
                value={formData.phone}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Adresse Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="jean.dupont@email.com"
                value={formData.email}
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
                N° de TVA / NIF
              </label>
              <input
                type="text"
                name="taxNumber"
                placeholder="ex: FR123456789"
                value={formData.taxNumber}
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                Adresse Physique
              </label>
              <input
                type="text"
                name="address"
                placeholder="123 Rue de la République"
                value={formData.address}
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
                Ville
              </label>
              <input
                type="text"
                name="city"
                placeholder="Paris"
                value={formData.city}
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
              {initialData ? 'Enregistrer les modifications' : 'Créer le client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
