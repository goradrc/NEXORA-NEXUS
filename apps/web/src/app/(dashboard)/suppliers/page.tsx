'use client';

import React, { useState, useEffect } from 'react';
import { SupplierDto, CreateSupplierDto, UpdateSupplierDto, SupplierStatus } from '@nexora/nexus';
import { useAuth } from '../../../context/AuthContext';
import { ApiClient } from '../../../services/api-client';

const initialSuppliers: SupplierDto[] = [
  {
    id: 'sup-001',
    organizationId: 'org-1',
    code: 'FOURN-001',
    name: 'Supplier Industrial Ltd',
    companyName: 'Industrial Hardware',
    email: 'sales@industrial.com',
    phone: '+33123456789',
    address: '10 Rue de la Paix, Paris',
    taxNumber: 'FR12345678901',
    balanceDue: 2500,
    paymentTerms: '30 NET',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export default function SuppliersPage() {
  const { activeOrganization } = useAuth();
  const [suppliers, setSuppliers] = useState<SupplierDto[]>(initialSuppliers);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto | null>(null);
  const [formData, setFormData] = useState<CreateSupplierDto>({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    taxNumber: '',
    paymentTerms: '30 NET',
    status: 'ACTIVE',
  });

  const loadSuppliers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await ApiClient.request<SupplierDto[]>('/suppliers');
      if (response.data && Array.isArray(response.data)) {
        setSuppliers(response.data);
      }
    } catch (err: any) {
      // Keep existing suppliers state if offline
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [activeOrganization?.id]);

  const handleOpenCreateModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      companyName: '',
      email: '',
      phone: '',
      address: '',
      taxNumber: '',
      paymentTerms: '30 NET',
      status: 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (supplier: SupplierDto) => {
    setEditingSupplier(supplier);
    setFormData({
      code: supplier.code,
      name: supplier.name,
      companyName: supplier.companyName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      taxNumber: supplier.taxNumber || '',
      paymentTerms: supplier.paymentTerms || '30 NET',
      status: supplier.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      if (editingSupplier) {
        const response = await ApiClient.request<SupplierDto>(`/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          body: formData,
        });
        const updated = response.data || {
          ...editingSupplier,
          ...formData,
          updatedAt: new Date().toISOString(),
        };
        setSuppliers((prev) => prev.map((s) => (s.id === editingSupplier.id ? (updated as SupplierDto) : s)));
      } else {
        const response = await ApiClient.request<SupplierDto>('/suppliers', {
          method: 'POST',
          body: formData,
        });
        const nextCode = `FOURN-${String(suppliers.length + 1).padStart(3, '0')}`;
        const created = response.data || {
          id: `sup-${Date.now()}`,
          organizationId: activeOrganization?.id || 'org-1',
          code: formData.code || nextCode,
          name: formData.name,
          companyName: formData.companyName,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          taxNumber: formData.taxNumber,
          balanceDue: 0,
          paymentTerms: formData.paymentTerms || '30 NET',
          status: formData.status || 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSuppliers((prev) => [...prev, created as SupplierDto]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'enregistrement');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: SupplierStatus) => {
    const targetAction = currentStatus === 'ACTIVE' ? 'désactiver' : 'activer';
    const newStatus: SupplierStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (confirm(`Voulez-vous vraiment ${targetAction} ce fournisseur ?`)) {
      try {
        await ApiClient.request(`/suppliers/${id}/status`, {
          method: 'PATCH',
          body: { status: newStatus },
        });

        setSuppliers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: newStatus, updatedAt: new Date().toISOString() } : s))
        );
      } catch (err: any) {
        alert(err.message || 'Erreur lors du changement de statut');
      }
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.companyName && s.companyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            Gestion des Fournisseurs
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
            Répertoire et suivi des partenaires achats pour : <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          style={{
            backgroundColor: '#0284c7',
            color: '#ffffff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>➕</span> Nouveau Fournisseur
        </button>
      </div>

      {/* Filter and Search Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
          backgroundColor: '#ffffff',
          padding: 16,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            type="text"
            placeholder="Rechercher par nom, code, email, entreprise..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIVE">Actifs uniquement</option>
            <option value="INACTIVE">Inactifs uniquement</option>
          </select>
        </div>
      </div>

      {/* Main Table Content */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          Chargement des fournisseurs...
        </div>
      ) : error ? (
        <div
          style={{
            padding: 16,
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            borderRadius: 6,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            color: '#64748b',
          }}
        >
          Aucun fournisseur trouvé.
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Code</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Fournisseur</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Contact</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Solde Dû</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Statut</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0284c7' }}>
                    {supplier.code}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{supplier.name}</div>
                    {supplier.companyName && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>{supplier.companyName}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>
                    <div>{supplier.email || '-'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{supplier.phone || ''}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: supplier.balanceDue > 0 ? '#dc2626' : '#16a34a' }}>
                    {supplier.balanceDue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: supplier.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                        color: supplier.status === 'ACTIVE' ? '#15803d' : '#64748b',
                      }}
                    >
                      {supplier.status === 'ACTIVE' ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleOpenEditModal(supplier)}
                      style={{
                        marginRight: 8,
                        backgroundColor: '#f1f5f9',
                        color: '#0f172a',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Éditer
                    </button>

                    <button
                      onClick={() => handleToggleStatus(supplier.id, supplier.status)}
                      style={{
                        backgroundColor: supplier.status === 'ACTIVE' ? '#fef2f2' : '#f0fdf4',
                        color: supplier.status === 'ACTIVE' ? '#dc2626' : '#16a34a',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {supplier.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
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
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              width: '100%',
              maxWidth: 500,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {editingSupplier ? 'Modifier le Fournisseur' : 'Créer un Fournisseur'}
            </h2>

            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Nom du fournisseur *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Raison sociale / Société
                </label>
                <input
                  type="text"
                  value={formData.companyName || ''}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Téléphone
                  </label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Adresse physique
                </label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Numéro fiscal (NIF / TVA)
                  </label>
                  <input
                    type="text"
                    value={formData.taxNumber || ''}
                    onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Conditions de paiement
                  </label>
                  <input
                    type="text"
                    value={formData.paymentTerms || ''}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    placeholder="30 NET, Comptant..."
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
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 6,
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
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
