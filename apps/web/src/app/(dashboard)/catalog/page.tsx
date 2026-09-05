'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { localDb, LocalProduct, LocalCategory } from '../../../offline/db';
import { ProductModal } from '../../../components/catalog/ProductModal';
import { CategoryModal } from '../../../components/catalog/CategoryModal';
import { PermissionGuard } from '../../../components/ui/PermissionGuard';

type ActiveTab = 'ALL' | 'PRODUCTS' | 'SERVICES' | 'CATEGORIES';

export default function CatalogPage() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || 'org-1';

  const canCreate = usePermissions('nexus:catalog:create');
  const canUpdate = usePermissions('nexus:catalog:update');
  const canDelete = usePermissions('nexus:catalog:delete');

  const [activeTab, setActiveTab] = useState<ActiveTab>('ALL');
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LocalProduct | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LocalCategory | null>(null);

  // Load data for active organization
  useEffect(() => {
    const orgProducts = localDb.products.filter((p) => p.organizationId === orgId);
    const orgCategories = localDb.categories.filter((c) => c.organizationId === orgId);
    setProducts([...orgProducts]);
    setCategories([...orgCategories]);
  }, [orgId]);

  // Categories Lookup Map
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  // Low stock products alert count
  const lowStockCount = useMemo(() => {
    return products.filter(
      (p) => p.type === 'PRODUCT' && p.currentStock <= p.minStockAlert
    ).length;
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = products;

    if (activeTab === 'PRODUCTS') {
      result = result.filter((p) => p.type === 'PRODUCT');
    } else if (activeTab === 'SERVICES') {
      result = result.filter((p) => p.type === 'SERVICE');
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return result;

    return result.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.reference.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term)) ||
        (categoryMap.get(p.categoryId) || '').toLowerCase().includes(term)
    );
  }, [products, activeTab, searchTerm, categoryMap]);

  // Filtered Categories
  const filteredCategories = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.type.toLowerCase().includes(term)
    );
  }, [categories, searchTerm]);

  // Handlers for Products
  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (product: LocalProduct) => {
    setEditingProduct(product);
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (data: Partial<LocalProduct>) => {
    if (editingProduct) {
      const updated: LocalProduct = {
        ...editingProduct,
        ...data,
      } as LocalProduct;

      const idx = localDb.products.findIndex(
        (p) => p.id === editingProduct.id && p.organizationId === orgId
      );
      if (idx !== -1) {
        localDb.products[idx] = updated;
      }

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'ProductService',
        entityId: updated.id,
        operation: 'UPDATE',
        payload: updated,
      });
    } else {
      const newId = `prod-${crypto.randomUUID()}`;
      const newProduct: LocalProduct = {
        id: newId,
        organizationId: orgId,
        categoryId: data.categoryId || (categories[0]?.id || 'cat-001'),
        defaultSupplierId: data.defaultSupplierId,
        type: data.type || 'PRODUCT',
        reference: data.reference || `SKU-${Date.now().toString().slice(-4)}`,
        name: data.name || '',
        description: data.description || '',
        salePrice: data.salePrice || 0,
        purchaseCost: data.purchaseCost || 0,
        taxRate: data.taxRate ?? 20,
        currentStock: data.currentStock ?? 0,
        minStockAlert: data.minStockAlert ?? 5,
        unit: data.unit || 'PCE',
      };

      localDb.products.push(newProduct);

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'ProductService',
        entityId: newProduct.id,
        operation: 'INSERT',
        payload: newProduct,
      });
    }

    const refreshed = localDb.products.filter((p) => p.organizationId === orgId);
    setProducts([...refreshed]);
    setIsProductModalOpen(false);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) return;

    localDb.products = localDb.products.filter(
      (p) => !(p.id === productId && p.organizationId === orgId)
    );

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'ProductService',
      entityId: productId,
      operation: 'DELETE',
      payload: { id: productId },
    });

    const refreshed = localDb.products.filter((p) => p.organizationId === orgId);
    setProducts([...refreshed]);
  };

  // Handlers for Categories
  const handleOpenCreateCategory = () => {
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (category: LocalCategory) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (data: Partial<LocalCategory>) => {
    if (editingCategory) {
      const updated: LocalCategory = {
        ...editingCategory,
        ...data,
      } as LocalCategory;

      const idx = localDb.categories.findIndex(
        (c) => c.id === editingCategory.id && c.organizationId === orgId
      );
      if (idx !== -1) {
        localDb.categories[idx] = updated;
      }

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Category',
        entityId: updated.id,
        operation: 'UPDATE',
        payload: updated,
      });
    } else {
      const newCategory: LocalCategory = {
        id: `cat-${crypto.randomUUID()}`,
        organizationId: orgId,
        name: data.name || '',
        type: data.type || 'PRODUCT',
      };

      localDb.categories.push(newCategory);

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: orgId,
        entityType: 'Category',
        entityId: newCategory.id,
        operation: 'INSERT',
        payload: newCategory,
      });
    }

    const refreshed = localDb.categories.filter((c) => c.organizationId === orgId);
    setCategories([...refreshed]);
    setIsCategoryModalOpen(false);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie ?')) return;

    localDb.categories = localDb.categories.filter(
      (c) => !(c.id === categoryId && c.organizationId === orgId)
    );

    await localDb.saveSyncMutation({
      id: crypto.randomUUID(),
      organizationId: orgId,
      entityType: 'Category',
      entityId: categoryId,
      operation: 'DELETE',
      payload: { id: categoryId },
    });

    const refreshed = localDb.categories.filter((c) => c.organizationId === orgId);
    setCategories([...refreshed]);
  };

  return (
    <PermissionGuard permission="nexus:catalog:read">
      <div>
        {/* Header */}
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
              Catalogue Produits & Services
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
              Gestion des articles, références SKU, prix, TVA, stocks et catégories pour{' '}
              <strong>{activeOrganization?.name || 'Entreprise Active'}</strong>
            </p>
          </div>

          {canCreate && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleOpenCreateCategory}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                📁 Nouvelle Catégorie
              </button>
              <button
                onClick={handleOpenCreateProduct}
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
                <span>➕</span> Nouveau Produit / Service
              </button>
            </div>
          )}
        </div>

        {/* KPI Counter Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total Articles</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {products.length}
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
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Produits Physiques</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
              {products.filter((p) => p.type === 'PRODUCT').length}
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
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Services & Prestations</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
              {products.filter((p) => p.type === 'SERVICE').length}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${lowStockCount > 0 ? '#fecaca' : '#e2e8f0'}`,
              backgroundColor: lowStockCount > 0 ? '#fff5f5' : '#ffffff',
            }}
          >
            <div style={{ fontSize: 12, color: lowStockCount > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
              Alertes Stock Bas
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: lowStockCount > 0 ? '#dc2626' : '#16a34a', marginTop: 4 }}>
              {lowStockCount}
            </div>
          </div>
        </div>

        {/* Tab Navigation & Search */}
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'ALL', label: 'Tous les Articles' },
                { id: 'PRODUCTS', label: '📦 Produits Physiques' },
                { id: 'SERVICES', label: '🛠️ Services' },
                { id: 'CATEGORIES', label: `📁 Catégories (${categories.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: activeTab === tab.id ? 700 : 500,
                    backgroundColor: activeTab === tab.id ? '#0f172a' : '#f1f5f9',
                    color: activeTab === tab.id ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: 280,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Content Table */}
        {activeTab === 'CATEGORIES' ? (
          /* Categories Table */
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
                    NOM DE LA CATÉGORIE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    TYPE D'USAGE
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
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                      Aucune catégorie trouvée.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat) => (
                    <tr key={cat.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                        📁 {cat.name}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor:
                              cat.type === 'PRODUCT'
                                ? '#e0f2fe'
                                : cat.type === 'SERVICE'
                                ? '#dcfce7'
                                : '#fef3c7',
                            color:
                              cat.type === 'PRODUCT'
                                ? '#0369a1'
                                : cat.type === 'SERVICE'
                                ? '#15803d'
                                : '#b45309',
                          }}
                        >
                          {cat.type}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          {canUpdate && (
                            <button
                              onClick={() => handleOpenEditCategory(cat)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
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
                              onClick={() => handleDeleteCategory(cat.id)}
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
        ) : (
          /* Products & Services Table */
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
                    SKU / REF
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    ARTICLE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    CATÉGORIE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    PRIX VENTE HT
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    TVA
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    PRIX TTC
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                    STOCK ACTUEL
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
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                      Aucun article trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => {
                    const isLowStock =
                      product.type === 'PRODUCT' &&
                      product.currentStock <= product.minStockAlert;

                    return (
                      <tr key={product.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                          <code>{product.reference}</code>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {product.type === 'SERVICE' ? '🛠️ ' : '📦 '}
                            {product.name}
                          </div>
                          {product.description && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {product.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#475569' }}>
                          {categoryMap.get(product.categoryId) || '—'}
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                          {product.salePrice.toLocaleString('fr-FR', {
                            style: 'currency',
                            currency: 'EUR',
                          })}{' '}
                          <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>
                            / {product.unit}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#475569' }}>
                          {product.taxRate}%
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0284c7' }}>
                          {(product.salePrice * (1 + (product.taxRate || 0) / 100)).toLocaleString('fr-FR', {
                            style: 'currency',
                            currency: 'EUR',
                          })}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {product.type === 'SERVICE' ? (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>N/A (Service)</span>
                          ) : (
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 12,
                                fontWeight: 700,
                                backgroundColor: isLowStock ? '#fef2f2' : '#f0fdf4',
                                color: isLowStock ? '#dc2626' : '#16a34a',
                              }}
                            >
                              {product.currentStock} {product.unit}
                              {isLowStock && ' ⚠️'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            {canUpdate && (
                              <button
                                onClick={() => handleOpenEditProduct(product)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  backgroundColor: '#ffffff',
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
                                onClick={() => handleDeleteProduct(product.id)}
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Modals */}
        <ProductModal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          onSave={handleSaveProduct}
          initialData={editingProduct}
          categories={categories}
          existingProducts={products}
        />

        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onSave={handleSaveCategory}
          initialData={editingCategory}
        />
      </div>
    </PermissionGuard>
  );
}
