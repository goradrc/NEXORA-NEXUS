'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { localDb, LocalCustomer } from '../../../offline/db';
import { CustomerModal } from '../../../components/customers/CustomerModal';
import { PermissionGuard } from '../../../components/ui/PermissionGuard';

export default function CustomersPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const canCreate = usePermissions('nexus:customers:create');
  const canUpdate = usePermissions('nexus:customers:update');
  const canDelete = usePermissions('nexus:customers:delete');

  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<LocalCustomer | null>(null);

  // Load customers for active organization
  useEffect(() => {
    const orgCustomers = localDb.customers.filter((c) => c.organizationId === orgId);
    setCustomers([...orgCustomers]);
  }, [orgId]);

  // Filtered customers list based on search
  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term) ||
        (c.companyName && c.companyName.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term))
    );
  }, [customers, searchTerm]);

  // Total receivables balance KPI
  const totalReceivables = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.balance || 0), 0);
  }, [customers]);

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer: LocalCustomer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (data: Partial<LocalCustomer>) => {
    if (editingCustomer) {
      // Update existing customer
      const updatedCustomer: LocalCustomer = {
        ...editingCustomer,
        ...data,
        updatedAt: new Date().toISOString(),
      };

      const index = localDb.customers.findIndex(
        (c) => c.id === editingCustomer.id && c.organizationId === orgId
      );
      if (index !== -1) {
        localDb.customers[index] = updatedCustomer;
      }

      // Record offline mutation
      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Customer',
        entityId: updatedCustomer.id,
        operation: 'UPDATE',
        payload: updatedCustomer,
      });
    } else {
      // Create new customer
      const newId = `cli-${crypto.randomUUID()}`;
      const existingCount = localDb.customers.filter((c) => c.organizationId === orgId).length;
      const generatedCode = data.code?.trim() || `CLI-${(existingCount + 1).toString().padStart(3, '0')}`;

      const newCustomer: LocalCustomer = {
        id: newId,
        organizationId: orgId,
        code: generatedCode,
        name: data.name || '',
        companyName: data.companyName || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        taxNumber: data.taxNumber || '',
        balance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      localDb.customers.push(newCustomer);

      // Record offline mutation
      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Customer',
        entityId: newCustomer.id,
        operation: 'INSERT',
        payload: newCustomer,
      });
    }

    // Refresh state
    const refreshed = localDb.customers.filter((c) => c.organizationId === orgId);
    setCustomers([...refreshed]);
    setIsModalOpen(false);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) return;

    localDb.customers = localDb.customers.filter(
      (c) => !(c.id === customerId && c.organizationId === orgId)
    );

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Customer',
      entityId: customerId,
      operation: 'DELETE',
      payload: { id: customerId },
    });

    const refreshed = localDb.customers.filter((c) => c.organizationId === orgId);
    setCustomers([...refreshed]);
  };

  return (
    <PermissionGuard permission="nexus:customers:read">
      <div>
        {/* Page Header */}
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
              Gestion des Clients CRM
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Annuaire des clients, coordonnées et suivi des créances pour{' '}
              <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
            </p>
          </div>

          {canCreate && (
            <button
              onClick={handleOpenCreateModal}
              style={{
                padding: '10px 18px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>➕</span> Nouveau Client
            </button>
          )}
        </div>

        {/* Stats KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: 16,
              backgroundColor: '#ffffff',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Total Clients Enregistrés
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {customers.length}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              backgroundColor: '#ffffff',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Encours Créances Global
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
              {totalReceivables.toLocaleString('fr-FR', {
                style: 'currency',
                currency: 'EUR',
              })}
            </div>
          </div>
        </div>

        {/* Search Bar & Filter */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            marginBottom: 20,
          }}
        >
          <input
            type="text"
            placeholder="Rechercher par nom, code, entreprise ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Customer Data Table */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  CODE
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  NOM / RAISON SOCIALE
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  CONTACT
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  VILLE
                </th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  SOLDE CRÉANCE
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#475569',
                    textAlign: 'right',
                  }}
                >
                  ACTIONS
                </th>
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
                      color: '#94a3b8',
                      fontSize: 14,
                    }}
                  >
                    Aucun client trouvé.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                      {customer.code}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{customer.name}</div>
                      {customer.companyName && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>{customer.companyName}</div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      <div>{customer.email || '—'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{customer.phone || '—'}</div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      {customer.city || '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: customer.balance > 0 ? '#d97706' : '#16a34a',
                        }}
                      >
                        {customer.balance.toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        {canUpdate && (
                          <button
                            onClick={() => handleOpenEditModal(customer)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              color: '#334155',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            ✏️ Éditer
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #fecaca',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            🗑️ Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Customer Form Modal */}
        <CustomerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveCustomer}
          initialData={editingCustomer}
        />
      </div>
    </PermissionGuard>
  );
}
