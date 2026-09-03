'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PermissionGuard } from '../../../components/ui/PermissionGuard';
import { CustomersService, CustomerDto, CreateCustomerDto, UpdateCustomerDto } from '@nexora/nexus';
import { localDb } from '../../../offline/db';

export default function CustomersPage() {
  const { user, activeOrganization } = useAuth();
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState<CreateCustomerDto>({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    taxNumber: '',
  });
  const [editFormData, setEditFormData] = useState<UpdateCustomerDto>({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    taxNumber: '',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tenantContext = {
    organizationId: activeOrganization?.id || 'org-1',
    userId: user?.userId || 'usr-123',
  };

  const userPermissions = user?.permissions || [
    'nexus:customers:read',
    'nexus:customers:create',
    'nexus:customers:update',
    'nexus:customers:delete',
  ];

  const loadCustomers = () => {
    try {
      const list = CustomersService.findAll(tenantContext, userPermissions);
      setCustomers(list);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [activeOrganization]);

  const filteredCustomers = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.companyName && c.companyName.toLowerCase().includes(term)) ||
      c.code.toLowerCase().includes(term) ||
      (c.email && c.email.toLowerCase().includes(term))
    );
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.name.trim()) {
      setErrorMsg('Le nom du client est obligatoire.');
      return;
    }

    try {
      const created = CustomersService.create(tenantContext, formData, userPermissions);

      // Save to local offline queue
      await localDb.saveSyncMutation({
        id: created.id,
        organizationId: tenantContext.organizationId,
        entityType: 'Customer',
        entityId: created.id,
        operation: 'INSERT',
        payload: created,
      });

      setIsCreateOpen(false);
      setFormData({
        name: '',
        companyName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        taxNumber: '',
      });
      loadCustomers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la création du client.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setErrorMsg(null);

    if (!editFormData.name?.trim()) {
      setErrorMsg('Le nom du client est obligatoire.');
      return;
    }

    try {
      const updated = CustomersService.update(
        tenantContext,
        selectedCustomer.id,
        editFormData,
        userPermissions
      );

      await localDb.saveSyncMutation({
        id: updated.id,
        organizationId: tenantContext.organizationId,
        entityType: 'Customer',
        entityId: updated.id,
        operation: 'UPDATE',
        payload: updated,
      });

      setIsEditOpen(false);
      setSelectedCustomer(null);
      loadCustomers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la modification du client.');
    }
  };

  const handleDelete = async (customer: CustomerDto) => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer le client ${customer.name} (${customer.code}) ?`
      )
    ) {
      try {
        CustomersService.delete(tenantContext, customer.id, userPermissions);

        await localDb.saveSyncMutation({
          id: customer.id,
          organizationId: tenantContext.organizationId,
          entityType: 'Customer',
          entityId: customer.id,
          operation: 'DELETE',
          payload: { id: customer.id },
        });

        loadCustomers();
      } catch (err: any) {
        alert(err.message || 'Erreur de suppression');
      }
    }
  };

  const openEdit = (customer: CustomerDto) => {
    setSelectedCustomer(customer);
    setEditFormData({
      name: customer.name,
      companyName: customer.companyName || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      taxNumber: customer.taxNumber || '',
    });
    setErrorMsg(null);
    setIsEditOpen(true);
  };

  const openDetail = (customer: CustomerDto) => {
    setSelectedCustomer(customer);
    setIsDetailOpen(true);
  };

  return (
    <PermissionGuard permission="nexus:customers:read">
        <div>
          {/* Header Bar */}
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
                CRM Clients & Comptes
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
                Gestion des clients et comptes entreprises pour :{' '}
                <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
              </p>
            </div>

            <PermissionGuard permission="nexus:customers:create">
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setIsCreateOpen(true);
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>➕</span> Nouveau Client
              </button>
            </PermissionGuard>
          </div>

          {/* Search Bar */}
          <div
            style={{
              marginBottom: 20,
              backgroundColor: '#ffffff',
              padding: 16,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 16 }}>🔍</span>
            <input
              type="text"
              placeholder="Rechercher par nom, entreprise, code client ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Effacer
              </button>
            )}
          </div>

          {/* Table */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Code</th>
                  <th style={{ padding: '12px 16px' }}>Nom / Entreprise</th>
                  <th style={{ padding: '12px 16px' }}>Contact</th>
                  <th style={{ padding: '12px 16px' }}>Ville</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Solde Créance</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 32,
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: 14,
                      }}
                    >
                      {searchTerm
                        ? 'Aucun client ne correspond à votre recherche.'
                        : 'Aucun client enregistré pour cette organisation.'}
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: 14,
                        color: '#1e293b',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0284c7' }}>
                        {c.code}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.companyName && (
                          <div style={{ fontSize: 12, color: '#64748b' }}>{c.companyName}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        {c.email && <div>✉️ {c.email}</div>}
                        {c.phone && <div>📞 {c.phone}</div>}
                        {!c.email && !c.phone && <span style={{ color: '#94a3b8' }}>-</span>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {c.city || <span style={{ color: '#94a3b8' }}>-</span>}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                        <span
                          style={{
                            color: c.balance > 0 ? '#d97706' : '#16a34a',
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: c.balance > 0 ? '#fef3c7' : '#dcfce7',
                          }}
                        >
                          {c.balance.toFixed(2)} €
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                        >
                          <button
                            onClick={() => openDetail(c)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: '1px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              color: '#334155',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                            title="Voir détail"
                          >
                            👁️ Voir
                          </button>

                          <PermissionGuard permission="nexus:customers:update">
                            <button
                              onClick={() => openEdit(c)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid #bae6fd',
                                backgroundColor: '#f0f9ff',
                                color: '#0284c7',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                              title="Éditer"
                            >
                              ✏️ Éditer
                            </button>
                          </PermissionGuard>

                          <PermissionGuard permission="nexus:customers:delete">
                            <button
                              onClick={() => handleDelete(c)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                border: '1px solid #fecaca',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                              title="Supprimer"
                            >
                              🗑️
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Create Modal */}
          {isCreateOpen && (
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
                  width: 500,
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                }}
              >
                <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  Nouveau Client
                </h2>

                {errorMsg && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 10,
                      borderRadius: 6,
                      backgroundColor: '#fef2f2',
                      border: '1px solid #f87171',
                      color: '#dc2626',
                      fontSize: 13,
                    }}
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleCreateSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="customerName" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Nom / Raison Sociale * :
                    </label>
                    <input
                      id="customerName"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Société :
                      </label>
                      <input
                        type="text"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        NIF / N° TVA :
                      </label>
                      <input
                        type="text"
                        value={formData.taxNumber}
                        onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Email :
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Téléphone :
                      </label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Adresse :
                      </label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Ville :
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setIsCreateOpen(false)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#475569',
                        fontSize: 13,
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
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Enregistrer Client
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {isEditOpen && selectedCustomer && (
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
                  width: 500,
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                }}
              >
                <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  Éditer Client : {selectedCustomer.code}
                </h2>

                {errorMsg && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 10,
                      borderRadius: 6,
                      backgroundColor: '#fef2f2',
                      border: '1px solid #f87171',
                      color: '#dc2626',
                      fontSize: 13,
                    }}
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleEditSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Nom / Raison Sociale * :
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Société :
                      </label>
                      <input
                        type="text"
                        value={editFormData.companyName || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        NIF / N° TVA :
                      </label>
                      <input
                        type="text"
                        value={editFormData.taxNumber || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, taxNumber: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Email :
                      </label>
                      <input
                        type="email"
                        value={editFormData.email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                        Téléphone :
                      </label>
                      <input
                        type="text"
                        value={editFormData.phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditOpen(false);
                        setSelectedCustomer(null);
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#475569',
                        fontSize: 13,
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
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Mettre à jour
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Detail View Modal */}
          {isDetailOpen && selectedCustomer && (
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
                  width: 500,
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    Fiche Client : {selectedCustomer.code}
                  </h2>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: selectedCustomer.balance > 0 ? '#fef3c7' : '#dcfce7',
                      color: selectedCustomer.balance > 0 ? '#b45309' : '#15803d',
                    }}
                  >
                    Solde : {selectedCustomer.balance.toFixed(2)} €
                  </span>
                </div>

                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.8 }}>
                  <div><strong>Nom :</strong> {selectedCustomer.name}</div>
                  <div><strong>Société :</strong> {selectedCustomer.companyName || '-'}</div>
                  <div><strong>Email :</strong> {selectedCustomer.email || '-'}</div>
                  <div><strong>Téléphone :</strong> {selectedCustomer.phone || '-'}</div>
                  <div><strong>Adresse :</strong> {selectedCustomer.address || '-'}</div>
                  <div><strong>Ville :</strong> {selectedCustomer.city || '-'}</div>
                  <div><strong>NIF / N° TVA :</strong> {selectedCustomer.taxNumber || '-'}</div>
                  <div><strong>Organisation :</strong> {selectedCustomer.organizationId}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
                    Créé le : {new Date(selectedCustomer.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                  <button
                    onClick={() => {
                      setIsDetailOpen(false);
                      setSelectedCustomer(null);
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f8fafc',
                      color: '#334155',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PermissionGuard>
  );
}
