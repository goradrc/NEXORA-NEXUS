import { TenantContext } from '@nexora/core';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { StockService } from '../../../apps/api/src/modules/nexus/stock/stock.service';
import { InventoryService } from '../../../apps/api/src/modules/nexus/inventory/inventory.service';
import { InvoicesService } from '../../../apps/api/src/modules/nexus/invoices/invoices.service';
import { CustomersService } from '../../../apps/api/src/modules/nexus/customers/customers.service';

describe('NEXORA NEXUS — FRONT-7 Lot 2 Inventory Domain & Atomic Reconciliation Test Suite', () => {
  const tenantA: TenantContext = { organizationId: 'org-tenant-A', userId: 'usr-admin-A' };
  const tenantB: TenantContext = { organizationId: 'org-tenant-B', userId: 'usr-admin-B' };

  const fullPermissions = [
    'nexus:customers:read',
    'nexus:customers:create',
    'nexus:customers:update',
    'nexus:catalog:read',
    'nexus:catalog:create',
    'nexus:stock:read',
    'nexus:stock:write',
    'nexus:invoices:read',
    'nexus:invoices:create',
    'nexus:invoices:manage',
    'nexus:inventory:read',
    'nexus:inventory:create',
    'nexus:inventory:write',
    'nexus:inventory:validate',
    'nexus:inventory:cancel',
  ];

  let categoryProduct: any;
  let categoryService: any;
  let productA: any;
  let serviceA: any;
  let customerA: any;

  beforeEach(() => {
    StockService.clearStoreForTesting();
    InventoryService.clearStoreForTesting();
    InvoicesService.clearStoreForTesting();
    CatalogService.clearStoreForTesting();

    customerA = CustomersService.create(
      tenantA,
      { name: 'Customer Test A' },
      fullPermissions
    );

    categoryProduct = CatalogService.createCategory(
      tenantA,
      { name: 'Hardware', type: 'PRODUCT' },
      fullPermissions
    );

    categoryService = CatalogService.createCategory(
      tenantA,
      { name: 'Services', type: 'SERVICE' },
      fullPermissions
    );

    productA = CatalogService.createProductService(
      tenantA,
      {
        categoryId: categoryProduct.id,
        type: 'PRODUCT',
        reference: 'PROD-INV-100',
        name: 'Storage Drive 1TB',
        salePrice: 120,
        purchaseCost: 80,
        currentStock: 100,
      },
      fullPermissions
    );

    serviceA = CatalogService.createProductService(
      tenantA,
      {
        categoryId: categoryService.id,
        type: 'SERVICE',
        reference: 'SERV-INV-001',
        name: 'Data Recovery Service',
        salePrice: 200,
      },
      fullPermissions
    );
  });

  describe('1. Inventory Creation, Start, Snapshot & Service Item Exclusion', () => {
    it('should create inventory in DRAFT status with INV-YYYY-0001 sequence', () => {
      const inv = InventoryService.create(
        tenantA,
        { notes: 'Annual stock count' },
        fullPermissions
      );

      const year = new Date().getFullYear();
      expect(inv.inventoryNumber).toEqual(`INV-${year}-0001`);
      expect(inv.status).toEqual('DRAFT');
      expect(inv.notes).toEqual('Annual stock count');
      expect(inv.lines).toHaveLength(0);
    });

    it('should start inventory, capture theoreticalQuantity snapshot, and exclude SERVICE items', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      const started = InventoryService.start(tenantA, inv.id, fullPermissions);

      expect(started.status).toEqual('IN_PROGRESS');
      // Only productA should be included; serviceA must be excluded
      expect(started.lines).toHaveLength(1);
      expect(started.lines[0].productId).toEqual(productA.id);
      expect(started.lines[0].theoreticalQuantity).toEqual(100);
      expect(started.lines[0].unitCost).toEqual(80);
    });
  });

  describe('2. Physical Count Saisie & Variance KPI Calculations', () => {
    it('should update physicalQuantity, calculate varianceQuantity and varianceValue KPI', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);

      const updated = InventoryService.updateCount(
        tenantA,
        { inventoryId: inv.id, productId: productA.id, physicalQuantity: 94, reason: '2 damaged, 4 missing' },
        fullPermissions
      );

      const line = updated.lines.find((l) => l.productId === productA.id);
      expect(line?.physicalQuantity).toEqual(94);
      expect(line?.varianceQuantity).toEqual(-6); // 94 - 100
      expect(line?.varianceValue).toEqual(-480); // -6 * 80
      expect(line?.reason).toEqual('2 damaged, 4 missing');
    });

    it('should reject negative physicalQuantity', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);

      expect(() =>
        InventoryService.updateCount(
          tenantA,
          { inventoryId: inv.id, productId: productA.id, physicalQuantity: -5 },
          fullPermissions
        )
      ).toThrow('INVALID_PHYSICAL_QUANTITY');
    });
  });

  describe('3. NON-NEGOTIABLE CRITICAL TEST (Section 19)', () => {
    it('CRITICAL TEST: theoretical=100, sale=-10, receipt=+5, currentStockAtValidation=95, physical=94 -> variance=-6, adjustment=-1, finalStock=94', () => {
      // 1. Démarrage de l'inventaire : Snapshot = 100
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);

      // 2. Mouvements commerciaux pendant l'inventaire :
      // Vente = -10 (Invoice émise)
      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2026-12-31',
          lineItems: [{ productServiceId: productA.id, description: 'Sale', quantity: 10, unitPrice: 120 }],
        },
        fullPermissions
      );
      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      // Réception = +5 (Stock IN)
      StockService.recordInMovement(
        tenantA,
        { productId: productA.id, quantity: 5, reason: 'Purchase Receipt' },
        fullPermissions
      );

      // Stock courant réel avant validation = 100 - 10 + 5 = 95
      expect(productA.currentStock).toEqual(95);

      // 3. Saisie du comptage physique = 94
      InventoryService.updateCount(
        tenantA,
        { inventoryId: inv.id, productId: productA.id, physicalQuantity: 94 },
        fullPermissions
      );

      // 4. Validation de l'inventaire
      const validated = InventoryService.validateInventory(
        tenantA,
        { inventoryId: inv.id, idempotencyKey: 'idemp-crit-test-94' },
        fullPermissions
      );

      const line = validated.lines.find((l) => l.productId === productA.id);

      // ASSERTIONS NON-NÉGOCIABLES :
      // variance (KPI initial) = 94 - 100 = -6
      expect(line?.varianceQuantity).toEqual(-6);

      // Stock final en BDD = 94
      expect(productA.currentStock).toEqual(94);

      // Vérifier le mouvement ADJUSTMENT créé :
      const movements = StockService.getMovements(tenantA, fullPermissions);
      const adjMovement = movements.find((m) => m.type === 'ADJUSTMENT');
      expect(adjMovement).toBeDefined();
      expect(adjMovement?.quantity).toEqual(1); // abs(94 - 95) = 1
      expect(adjMovement?.referenceDocType).toEqual('INVENTORY');
      expect(adjMovement?.referenceDocId).toEqual(inv.id);
    });
  });

  describe('4. Inventory Adjustments (Surplus, Deficit & Zero Delta)', () => {
    it('should handle positive adjustment (surplus: physical 105 > currentStock 100)', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv.id, productId: productA.id, physicalQuantity: 105 }, fullPermissions);

      const validated = InventoryService.validateInventory(
        tenantA,
        { inventoryId: inv.id, idempotencyKey: 'idemp-surplus-105' },
        fullPermissions
      );

      expect(productA.currentStock).toEqual(105);
      const adjMovement = StockService.getMovements(tenantA, fullPermissions).find((m) => m.type === 'ADJUSTMENT');
      expect(adjMovement?.quantity).toEqual(5);
    });

    it('should generate 0 stock movements when physicalQuantity equals currentStockAtValidation', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv.id, productId: productA.id, physicalQuantity: 100 }, fullPermissions);

      const initialMovementsCount = StockService.getMovements(tenantA, fullPermissions).length;

      InventoryService.validateInventory(
        tenantA,
        { inventoryId: inv.id, idempotencyKey: 'idemp-exact-100' },
        fullPermissions
      );

      expect(productA.currentStock).toEqual(100);
      expect(StockService.getMovements(tenantA, fullPermissions)).toHaveLength(initialMovementsCount);
    });
  });

  describe('5. Concurrence & Idempotency Rules', () => {
    it('should handle idempotency key retries on the same inventory without duplicating movements', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv.id, productId: productA.id, physicalQuantity: 90 }, fullPermissions);

      const key = 'idemp-retry-same-key';
      const val1 = InventoryService.validateInventory(tenantA, { inventoryId: inv.id, idempotencyKey: key }, fullPermissions);
      expect(val1.status).toEqual('VALIDATED');
      expect(productA.currentStock).toEqual(90);

      // Replay same request with same key
      const val2 = InventoryService.validateInventory(tenantA, { inventoryId: inv.id, idempotencyKey: key }, fullPermissions);
      expect(val2.status).toEqual('VALIDATED');
      expect(productA.currentStock).toEqual(90);

      // Only 1 ADJUSTMENT movement in store
      expect(StockService.getMovements(tenantA, fullPermissions)).toHaveLength(1);
    });

    it('should reject idempotency key reuse on a DIFFERENT inventory with 409 IDEMPOTENCY_KEY_REUSED', () => {
      const key = 'idemp-shared-key-test';

      const inv1 = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv1.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv1.id, productId: productA.id, physicalQuantity: 90 }, fullPermissions);
      InventoryService.validateInventory(tenantA, { inventoryId: inv1.id, idempotencyKey: key }, fullPermissions);

      const inv2 = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv2.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv2.id, productId: productA.id, physicalQuantity: 80 }, fullPermissions);

      expect(() =>
        InventoryService.validateInventory(tenantA, { inventoryId: inv2.id, idempotencyKey: key }, fullPermissions)
      ).toThrow('IDEMPOTENCY_KEY_REUSED');
    });

    it('should allow same idempotency key across DIFFERENT organizations', () => {
      const key = 'idemp-cross-tenant-key';

      // Create productB for tenantB
      const categoryB = CatalogService.createCategory(tenantB, { name: 'Cat B', type: 'PRODUCT' }, fullPermissions);
      const productB = CatalogService.createProductService(
        tenantB,
        { categoryId: categoryB.id, type: 'PRODUCT', reference: 'PROD-B', name: 'Prod B', salePrice: 50, currentStock: 50 },
        fullPermissions
      );

      const invA = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, invA.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: invA.id, productId: productA.id, physicalQuantity: 95 }, fullPermissions);
      InventoryService.validateInventory(tenantA, { inventoryId: invA.id, idempotencyKey: key }, fullPermissions);

      const invB = InventoryService.create(tenantB, {}, fullPermissions);
      InventoryService.start(tenantB, invB.id, fullPermissions);
      InventoryService.updateCount(tenantB, { inventoryId: invB.id, productId: productB.id, physicalQuantity: 45 }, fullPermissions);

      expect(() =>
        InventoryService.validateInventory(tenantB, { inventoryId: invB.id, idempotencyKey: key }, fullPermissions)
      ).not.toThrow();
    });

    it('should handle concurrent validation requests via Promise.allSettled atomically', async () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv.id, productId: productA.id, physicalQuantity: 85 }, fullPermissions);

      const results = await Promise.allSettled([
        Promise.resolve().then(() =>
          InventoryService.validateInventory(tenantA, { inventoryId: inv.id, idempotencyKey: 'key-concurrent-1' }, fullPermissions)
        ),
        Promise.resolve().then(() =>
          InventoryService.validateInventory(tenantA, { inventoryId: inv.id, idempotencyKey: 'key-concurrent-2' }, fullPermissions)
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      expect(productA.currentStock).toEqual(85);
    });
  });

  describe('6. Immutability, Cancellation, RBAC & Tenant Isolation', () => {
    it('should reject count updates or re-validation on VALIDATED inventory (INVENTORY_LOCKED)', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);
      InventoryService.updateCount(tenantA, { inventoryId: inv.id, productId: productA.id, physicalQuantity: 90 }, fullPermissions);
      InventoryService.validateInventory(tenantA, { inventoryId: inv.id, idempotencyKey: 'idemp-locked-1' }, fullPermissions);

      expect(() =>
        InventoryService.updateCount(tenantA, { inventoryId: inv.id, productId: productA.id, physicalQuantity: 80 }, fullPermissions)
      ).toThrow('INVENTORY_LOCKED');

      expect(() => InventoryService.cancelInventory(tenantA, { inventoryId: inv.id }, fullPermissions)).toThrow('INVENTORY_LOCKED');
    });

    it('should cancel IN_PROGRESS inventory without generating any stock movements', () => {
      const inv = InventoryService.create(tenantA, {}, fullPermissions);
      InventoryService.start(tenantA, inv.id, fullPermissions);

      const cancelled = InventoryService.cancelInventory(tenantA, { inventoryId: inv.id, reason: 'Scrapped session' }, fullPermissions);
      expect(cancelled.status).toEqual('CANCELLED');
      expect(productA.currentStock).toEqual(100);
      expect(StockService.getMovements(tenantA, fullPermissions)).toHaveLength(0);
    });

    it('should enforce RBAC permissions and throw FORBIDDEN_PERMISSION if user lacks required permission', () => {
      const restrictedPermissions = ['nexus:inventory:read'];

      expect(() =>
        InventoryService.create(tenantA, {}, restrictedPermissions)
      ).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should enforce strict tenant isolation and reject cross-tenant inventory access', () => {
      const invA = InventoryService.create(tenantA, {}, fullPermissions);

      expect(() =>
        InventoryService.findOne(tenantB, invA.id, fullPermissions)
      ).toThrow('INVENTORY_NOT_FOUND');
    });
  });
});
