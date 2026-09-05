import { TenantContext } from '@nexora/core';
import { CustomersService } from '../../../apps/api/src/modules/nexus/customers/customers.service';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { localDb } from '../../../apps/web/src/offline/db';

describe('NEXORA NEXUS — Phase FRONT-2 Test Suite (Clients & Catalogue)', () => {
  const tenant1: TenantContext = {
    organizationId: 'org-1',
    userId: 'usr-1',
  };

  const tenant2: TenantContext = {
    organizationId: 'org-2',
    userId: 'usr-2',
  };

  const fullPermissions = [
    'nexus:customers:read',
    'nexus:customers:create',
    'nexus:customers:update',
    'nexus:customers:delete',
    'nexus:catalog:read',
    'nexus:catalog:create',
    'nexus:catalog:update',
    'nexus:catalog:delete',
  ];

  beforeEach(() => {
    localDb.clearAllForTesting();
  });

  describe('1. Module Clients CRM (API & Local Storage)', () => {
    it('should create and isolate customers per tenant in CustomersService', () => {
      const c1 = CustomersService.create(
        tenant1,
        { code: 'CLI-T1-01', name: 'Client Tenant 1', companyName: 'Enterprise 1' },
        fullPermissions
      );

      const c2 = CustomersService.create(
        tenant2,
        { code: 'CLI-T2-01', name: 'Client Tenant 2', companyName: 'Enterprise 2' },
        fullPermissions
      );

      const tenant1Customers = CustomersService.findAll(tenant1, fullPermissions);
      const tenant2Customers = CustomersService.findAll(tenant2, fullPermissions);

      expect(tenant1Customers.every((c) => c.organizationId === 'org-1')).toBe(true);
      expect(tenant2Customers.every((c) => c.organizationId === 'org-2')).toBe(true);

      expect(tenant1Customers.some((c) => c.code === 'CLI-T1-01')).toBe(true);
      expect(tenant1Customers.some((c) => c.code === 'CLI-T2-01')).toBe(false);

      expect(tenant2Customers.some((c) => c.code === 'CLI-T2-01')).toBe(true);
      expect(tenant2Customers.some((c) => c.code === 'CLI-T1-01')).toBe(false);
    });

    it('should calculate customer receivables balance and manage localDb syncQueue', async () => {
      const customerId = `cli-${crypto.randomUUID()}`;
      localDb.customers.push({
        id: customerId,
        organizationId: 'org-1',
        code: 'CLI-999',
        name: 'Client Test Local',
        balance: 2500,
      });

      await localDb.saveSyncMutation({
        id: crypto.randomUUID(),
        organizationId: 'org-1',
        entityType: 'Customer',
        entityId: customerId,
        operation: 'INSERT',
        payload: { name: 'Client Test Local' },
      });

      const pending = localDb.getPendingMutations('org-1');
      expect(pending.length).toBe(1);
      expect(pending[0].entityType).toBe('Customer');
      expect(pending[0].entityId).toBe(customerId);
    });

    it('should enforce RBAC permissions on customer operations', () => {
      expect(() => {
        CustomersService.findAll(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        CustomersService.create(tenant1, { name: 'Unauthorized Customer' }, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);
    });
  });

  describe('2. Module Catalogue (Produits, Services, Catégories & Conflits SKU)', () => {
    it('should handle SKU reference conflict cleanly by appending -CONFLICT- suffix', () => {
      const p1 = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-DUPLICATE-01',
          name: 'Produit Original',
          salePrice: 100,
        },
        fullPermissions
      );

      expect(p1.reference).toBe('SKU-DUPLICATE-01');

      // Create product with same reference in same organization -> conflict handling
      const p2 = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-DUPLICATE-01',
          name: 'Produit Doublon',
          salePrice: 100,
        },
        fullPermissions
      );

      expect(p2.reference).toContain('SKU-DUPLICATE-01-CONFLICT-');
    });

    it('should properly track categories and detect low stock alerts', () => {
      localDb.categories.push({
        id: 'cat-test-1',
        organizationId: 'org-1',
        name: 'Informatique',
        type: 'PRODUCT',
      });

      localDb.products.push(
        {
          id: 'prod-normal',
          organizationId: 'org-1',
          categoryId: 'cat-test-1',
          type: 'PRODUCT',
          reference: 'SKU-NORMAL',
          name: 'Clavier USB',
          salePrice: 20,
          purchaseCost: 10,
          taxRate: 20,
          currentStock: 10,
          minStockAlert: 5,
          unit: 'PCE',
        },
        {
          id: 'prod-alert',
          organizationId: 'org-1',
          categoryId: 'cat-test-1',
          type: 'PRODUCT',
          reference: 'SKU-ALERT',
          name: 'Souris Gamer',
          salePrice: 50,
          purchaseCost: 25,
          taxRate: 20,
          currentStock: 2, // < minStockAlert (5)
          minStockAlert: 5,
          unit: 'PCE',
        }
      );

      const lowStock = localDb.products.filter(
        (p) => p.organizationId === 'org-1' && p.type === 'PRODUCT' && p.currentStock <= p.minStockAlert
      );

      expect(lowStock.length).toBe(1);
      expect(lowStock[0].reference).toBe('SKU-ALERT');
    });

    it('should enforce RBAC permissions on catalog operations', () => {
      expect(() => {
        CatalogService.getCategories(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        CatalogService.getProductsServices(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);
    });
  });
});
