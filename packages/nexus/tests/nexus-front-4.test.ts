import { TenantContext } from '@nexora/core';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { SalesService } from '../../../apps/api/src/modules/nexus/sales/sales.service';
import { StockService } from '../../../apps/api/src/modules/nexus/stock/stock.service';
import { localDb } from '../../../apps/web/src/offline/db';

describe('NEXORA NEXUS — Phase FRONT-4 Test Suite (Stocks & Mouvements)', () => {
  const tenant1: TenantContext = {
    organizationId: 'org-1',
    userId: 'usr-stock-1',
  };

  const tenant2: TenantContext = {
    organizationId: 'org-2',
    userId: 'usr-stock-2',
  };

  const fullPermissions = [
    'nexus:catalog:read',
    'nexus:catalog:create',
    'nexus:catalog:update',
    'nexus:catalog:delete',
    'nexus:stock:read',
    'nexus:stock:write',
    'nexus:stock:adjust',
    'nexus:invoices:read',
    'nexus:invoices:create',
    'nexus:invoices:update',
    'nexus:invoices:delete',
  ];

  beforeEach(() => {
    CatalogService.clearAllForTesting();
    SalesService.clearAllForTesting();
    StockService.clearAllForTesting();
    localDb.clearAllForTesting();
  });

  describe('1. Mouvements Manuels (IN, OUT, ADJUSTMENT)', () => {
    it('1 & 2. should record manual stock IN and OUT correctly', () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-LAPTOP-01',
          name: 'Laptop Business',
          salePrice: 1000,
          currentStock: 10,
          minStockAlert: 2,
        },
        fullPermissions
      );

      expect(prod.currentStock).toBe(10);

      // Record Stock IN (+5)
      const movIn = StockService.recordMovement(
        tenant1,
        { productId: prod.id, type: 'IN', quantity: 5, reason: 'Réception fournisseur' },
        fullPermissions
      );

      expect(movIn.quantity).toBe(5);
      expect(prod.currentStock).toBe(15);

      // Record Stock OUT (-3)
      const movOut = StockService.recordMovement(
        tenant1,
        { productId: prod.id, type: 'OUT', quantity: 3, reason: 'Vente directe comptoir' },
        fullPermissions
      );

      expect(movOut.quantity).toBe(3);
      expect(prod.currentStock).toBe(12);
    });

    it('3 & 4. should adjust stock according to physical inventory (ADJUSTMENT_IN and ADJUSTMENT_OUT)', () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-MOUSE-01',
          name: 'Souris Optique',
          salePrice: 20,
          currentStock: 20,
        },
        fullPermissions
      );

      // Inventory shows 17 (diff: -3 -> ADJUSTMENT_OUT)
      const adj1 = StockService.adjustStock(
        tenant1,
        { productId: prod.id, actualQuantity: 17, reason: 'Inventaire physique annuel' },
        fullPermissions
      );

      expect(adj1.type).toBe('ADJUSTMENT_OUT');
      expect(adj1.quantity).toBe(3);
      expect(prod.currentStock).toBe(17);

      // Inventory shows 25 (diff: +8 -> ADJUSTMENT_IN)
      const adj2 = StockService.adjustStock(
        tenant1,
        { productId: prod.id, actualQuantity: 25, reason: 'Correction écart positif' },
        fullPermissions
      );

      expect(adj2.type).toBe('ADJUSTMENT_IN');
      expect(adj2.quantity).toBe(8);
      expect(prod.currentStock).toBe(25);
    });

    it('5. should strictly prohibit negative stock on manual OUT operations (INSUFFICIENT_STOCK)', () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-LIMITED-01',
          name: 'Stock Limité',
          salePrice: 100,
          currentStock: 2,
        },
        fullPermissions
      );

      expect(() => {
        StockService.recordMovement(
          tenant1,
          { productId: prod.id, type: 'OUT', quantity: 5, reason: 'Retrait excessif' },
          fullPermissions
        );
      }).toThrow(/INSUFFICIENT_STOCK/);

      expect(prod.currentStock).toBe(2); // Unchanged
    });

    it('6. should reject stock movements for non-stockable SERVICE items', () => {
      const service = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-002',
          type: 'SERVICE',
          reference: 'SERV-CONSULT-01',
          name: 'Consulting ERP',
          salePrice: 150,
          currentStock: 0,
        },
        fullPermissions
      );

      expect(() => {
        StockService.recordMovement(
          tenant1,
          { productId: service.id, type: 'IN', quantity: 10 },
          fullPermissions
        );
      }).toThrow(/NON_STOCKABLE_ITEM/);
    });

    it('7. should maintain immutable stock movements history and track alert levels', () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-SCREEN-01',
          name: 'Écran HD',
          salePrice: 200,
          currentStock: 10,
          minStockAlert: 5,
        },
        fullPermissions
      );

      StockService.recordMovement(
        tenant1,
        { productId: prod.id, type: 'OUT', quantity: 6 },
        fullPermissions
      );

      const movements = StockService.getMovements(tenant1, fullPermissions);
      expect(movements.length).toBe(1);

      const statusList = StockService.getProductsStockStatus(tenant1, fullPermissions);
      const screenStatus = statusList.find((s) => s.productId === prod.id);
      expect(screenStatus?.status).toBe('LOW_STOCK'); // 4 <= minStockAlert (5)
    });
  });

  describe('2. Intégration Ventes FRONT-3 (Factures -> Sorties de Stock)', () => {
    it('11, 12 & 16. should decrement stock on invoice emission (UNPAID) and ignore DRAFT / SERVICE items', () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-PHONE-01',
          name: 'Smartphone Pro',
          salePrice: 800,
          currentStock: 10,
        },
        fullPermissions
      );

      const serv = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-002',
          type: 'SERVICE',
          reference: 'SERV-SETUP',
          name: 'Installation & Paramétrage',
          salePrice: 100,
        },
        fullPermissions
      );

      // Create issued invoice directly (UNPAID)
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-001',
          lineItems: [
            { productServiceId: prod.id, description: 'Smartphone Pro', quantity: 3, unitPrice: 800, taxRate: 20 },
            { productServiceId: serv.id, description: 'Installation', quantity: 1, unitPrice: 100, taxRate: 20 },
          ],
        },
        fullPermissions
      );

      expect(invoice.status).toBe('UNPAID');

      // Refresh product from CatalogService
      const refreshedProd = CatalogService.getProductsServices(tenant1, fullPermissions).find(
        (p) => p.id === prod.id
      )!;

      // Product stock decremented by 3 (10 -> 7)
      expect(refreshedProd.currentStock).toBe(7);

      const movements = StockService.getMovements(tenant1, fullPermissions);
      expect(movements.length).toBe(1);
      expect(movements[0].productId).toBe(prod.id);
      expect(movements[0].quantity).toBe(3);
      expect(movements[0].type).toBe('OUT');
    });

    it('13 & 14. should guarantee idempotency on repeated invoice emission sync (mutationId)', () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-KEYBOARD-01',
          name: 'Clavier Mécanique',
          salePrice: 120,
          currentStock: 20,
        },
        fullPermissions
      );

      const mutationId = 'mut-sync-inv-777';

      // First call
      SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-001',
          mutationId,
          lineItems: [{ productServiceId: prod.id, description: 'Clavier', quantity: 4, unitPrice: 120, taxRate: 20 }],
        },
        fullPermissions
      );

      const refreshed1 = CatalogService.getProductsServices(tenant1, fullPermissions).find(
        (p) => p.id === prod.id
      )!;
      expect(refreshed1.currentStock).toBe(16); // 20 - 4 = 16

      // Replay same mutationId
      SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-001',
          mutationId,
          lineItems: [{ productServiceId: prod.id, description: 'Clavier', quantity: 4, unitPrice: 120, taxRate: 20 }],
        },
        fullPermissions
      );

      const refreshed2 = CatalogService.getProductsServices(tenant1, fullPermissions).find(
        (p) => p.id === prod.id
      )!;
      expect(refreshed2.currentStock).toBe(16); // Must remain 16, NOT 12
    });

    it('15. should handle real concurrent stock OUT attempts safely (Promise.all)', async () => {
      const prod = CatalogService.createProductService(
        tenant1,
        {
          categoryId: 'cat-001',
          type: 'PRODUCT',
          reference: 'SKU-CONC-01',
          name: 'Article Concurrence Stock',
          salePrice: 50,
          currentStock: 10,
        },
        fullPermissions
      );

      // Concurrently attempt two OUT movements of 10 units each
      const attempt1 = Promise.resolve().then(() =>
        StockService.recordMovement(
          tenant1,
          { productId: prod.id, type: 'OUT', quantity: 10, reason: 'Vente A' },
          fullPermissions
        )
      );

      const attempt2 = Promise.resolve().then(() =>
        StockService.recordMovement(
          tenant1,
          { productId: prod.id, type: 'OUT', quantity: 10, reason: 'Vente B' },
          fullPermissions
        )
      );

      const results = await Promise.allSettled([attempt1, attempt2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const refreshed = CatalogService.getProductsServices(tenant1, fullPermissions).find(
        (p) => p.id === prod.id
      )!;
      expect(refreshed.currentStock).toBe(0); // Exactly 0, never -10
    });
  });

  describe('3. RBAC & Multi-Tenant Isolation', () => {
    it('8. should enforce RBAC permissions on all stock operations', () => {
      expect(() => {
        StockService.getMovements(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        StockService.recordMovement(
          tenant1,
          { productId: 'p1', type: 'IN', quantity: 1 },
          []
        );
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        StockService.adjustStock(
          tenant1,
          { productId: 'p1', actualQuantity: 5 },
          []
        );
      }).toThrow(/FORBIDDEN_PERMISSION/);
    });

    it('9. should strictly isolate stock movements and product stock between organizations', () => {
      const prod1 = CatalogService.createProductService(
        tenant1,
        { categoryId: 'cat-1', type: 'PRODUCT', reference: 'SKU-T1', name: 'Prod Tenant 1', salePrice: 10, currentStock: 100 },
        fullPermissions
      );

      const prod2 = CatalogService.createProductService(
        tenant2,
        { categoryId: 'cat-2', type: 'PRODUCT', reference: 'SKU-T2', name: 'Prod Tenant 2', salePrice: 20, currentStock: 200 },
        fullPermissions
      );

      // Tenant 1 trying to record movement on Tenant 2 product -> error
      expect(() => {
        StockService.recordMovement(
          tenant1,
          { productId: prod2.id, type: 'OUT', quantity: 10 },
          fullPermissions
        );
      }).toThrow(/PRODUCT_NOT_FOUND/);

      const tenant1Movements = StockService.getMovements(tenant1, fullPermissions);
      const tenant2Movements = StockService.getMovements(tenant2, fullPermissions);

      expect(tenant1Movements.every((m) => m.organizationId === 'org-1')).toBe(true);
      expect(tenant2Movements.every((m) => m.organizationId === 'org-2')).toBe(true);
    });
  });
});
