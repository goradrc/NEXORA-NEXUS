import { PurchaseOrdersService } from '../../../apps/api/src/modules/nexus/purchase-orders/purchase-orders.service';
import { PurchaseOrdersController } from '../../../apps/api/src/modules/nexus/purchase-orders/purchase-orders.controller';
import { SuppliersService } from '../../../apps/api/src/modules/nexus/suppliers/suppliers.service';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { CreatePurchaseOrderDto } from '@nexora/nexus';

describe('NEXORA NEXUS — Purchase Orders Module Test Suite', () => {
  const tenantOrg1 = { organizationId: 'org-1', userId: 'usr-1' };
  const tenantOrg2 = { organizationId: 'org-2', userId: 'usr-2' };
  const fullPermissions = [
    'nexus:purchase-orders:read',
    'nexus:purchase-orders:create',
    'nexus:purchase-orders:update',
    'nexus:purchase-orders:delete',
    'nexus:suppliers:read',
    'nexus:suppliers:create',
    'nexus:catalog:read',
    'nexus:catalog:create',
  ];

  let supplier1Id: string;
  let productId: string;
  let serviceId: string;

  beforeEach(() => {
    PurchaseOrdersService.clearStoreForTesting();

    // Setup mock supplier
    const supplier = SuppliersService.create(
      tenantOrg1,
      { name: 'Tech Hardware Supplier' },
      fullPermissions
    );
    supplier1Id = supplier.id;

    // Setup mock category and catalog items
    const cat = CatalogService.createCategory(
      tenantOrg1,
      { name: 'Hardware', type: 'PRODUCT' },
      fullPermissions
    );

    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const product = CatalogService.createProductService(
      tenantOrg1,
      {
        categoryId: cat.id,
        type: 'PRODUCT',
        reference: `SKU-PO-${uniqueId}`,
        name: 'Workstation Laptop',
        salePrice: 1200,
        purchaseCost: 800,
        taxRate: 20,
        currentStock: 10,
      },
      fullPermissions
    );
    productId = product.id;

    const service = CatalogService.createProductService(
      tenantOrg1,
      {
        categoryId: cat.id,
        type: 'SERVICE',
        reference: `SKU-SRV-${uniqueId}`,
        name: 'Installation Service',
        salePrice: 150,
        purchaseCost: 100,
        taxRate: 0,
        currentStock: 0,
      },
      fullPermissions
    );
    serviceId = service.id;
  });

  describe('1. Purchase Order Creation & Calculation', () => {
    it('should create a DRAFT purchase order with calculated line items and auto CMD-ACH code', () => {
      const dto: CreatePurchaseOrderDto = {
        supplierId: supplier1Id,
        expectedDate: '2026-10-01',
        notes: 'Urgent order for Q4 stock',
        lineItems: [
          { productServiceId: productId, quantity: 5, unitPrice: 800, taxRate: 20 },
        ],
      };

      const po = PurchaseOrdersService.create(tenantOrg1, dto, fullPermissions);

      expect(po.id).toBeDefined();
      expect(po.organizationId).toEqual('org-1');
      expect(po.poNumber).toMatch(/^CMD-ACH-\d{3}$/);
      expect(po.status).toEqual('DRAFT');
      expect(po.totalUntaxed).toEqual(4000); // 5 * 800
      expect(po.totalTax).toEqual(800); // 4000 * 20%
      expect(po.totalAmount).toEqual(4800);
      expect(po.lineItems).toHaveLength(1);
      expect(po.lineItems[0].totalPrice).toEqual(4800);
    });

    it('should reject creation when line item quantity is negative or zero', () => {
      const dto: CreatePurchaseOrderDto = {
        supplierId: supplier1Id,
        lineItems: [
          { productServiceId: productId, quantity: 0, unitPrice: 800 },
        ],
      };

      expect(() => {
        PurchaseOrdersService.create(tenantOrg1, dto, fullPermissions);
      }).toThrow('INVALID_LINE_ITEM_QUANTITY');
    });
  });

  describe('2. Multi-Tenant Isolation', () => {
    it('should isolate purchase orders strictly by organizationId', () => {
      const po1 = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 2, unitPrice: 500 }],
        },
        fullPermissions
      );

      const org1POs = PurchaseOrdersService.findAll(tenantOrg1, fullPermissions);
      const org2POs = PurchaseOrdersService.findAll(tenantOrg2, fullPermissions);

      expect(org1POs.some((p) => p.id === po1.id)).toBe(true);
      expect(org2POs.some((p) => p.id === po1.id)).toBe(false);
    });

    it('should throw error when accessing or receiving cross-tenant purchase order', () => {
      const po1 = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 2, unitPrice: 500 }],
        },
        fullPermissions
      );

      expect(() => {
        PurchaseOrdersService.findOne(tenantOrg2, po1.id, fullPermissions);
      }).toThrow('PURCHASE_ORDER_NOT_FOUND');

      expect(() => {
        PurchaseOrdersService.receive(tenantOrg2, po1.id, fullPermissions);
      }).toThrow('PURCHASE_ORDER_NOT_FOUND');
    });
  });

  describe('3. State Machine Transitions', () => {
    it('should transition from DRAFT to ORDERED properly', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 2, unitPrice: 500 }],
        },
        fullPermissions
      );

      const ordered = PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);
      expect(ordered.status).toEqual('ORDERED');
    });

    it('should transition from DRAFT to CANCELLED properly', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 2, unitPrice: 500 }],
        },
        fullPermissions
      );

      const cancelled = PurchaseOrdersService.cancel(tenantOrg1, po.id, fullPermissions);
      expect(cancelled.status).toEqual('CANCELLED');
    });

    it('should disallow invalid status transitions on CANCELLED or RECEIVED orders', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 2, unitPrice: 500 }],
        },
        fullPermissions
      );

      PurchaseOrdersService.cancel(tenantOrg1, po.id, fullPermissions);

      // Attempt to receive CANCELLED order
      expect(() => {
        PurchaseOrdersService.receive(tenantOrg1, po.id, fullPermissions);
      }).toThrow('INVALID_PO_STATUS_TRANSITION');
    });
  });

  describe('4. Stock Integration & Idempotency Rules (CRITICAL)', () => {
    it('CRITICAL RULE: Creation and ORDERED status transition MUST produce ZERO stock movements and NOT change currentStock', () => {
      const productsBefore = CatalogService.getProductsServices(tenantOrg1, fullPermissions);
      const targetProductBefore = productsBefore.find((p) => p.id === productId)!;
      const initialStock = targetProductBefore.currentStock;

      // 1. Create PO
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 15, unitPrice: 500 }],
        },
        fullPermissions
      );

      let movements = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movements).toHaveLength(0);
      expect(targetProductBefore.currentStock).toEqual(initialStock);

      // 2. Mark ORDERED
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      movements = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movements).toHaveLength(0);
      expect(targetProductBefore.currentStock).toEqual(initialStock);
    });

    it('CRITICAL RULE: Transitioning to RECEIVED increases currentStock and generates stock IN movement for PRODUCT items only', () => {
      const products = CatalogService.getProductsServices(tenantOrg1, fullPermissions);
      const targetProduct = products.find((p) => p.id === productId)!;
      const initialStock = targetProduct.currentStock;

      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [
            { productServiceId: productId, quantity: 8, unitPrice: 500 },
            { productServiceId: serviceId, quantity: 1, unitPrice: 150 }, // Service item -> no stock movement
          ],
        },
        fullPermissions
      );

      const receivedPO = PurchaseOrdersService.receive(tenantOrg1, po.id, fullPermissions);
      expect(receivedPO.status).toEqual('RECEIVED');
      expect(receivedPO.receivedAt).toBeDefined();

      // Check product stock increased
      expect(targetProduct.currentStock).toEqual(initialStock + 8);

      // Check recorded stock movement IN
      const movements = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movements).toHaveLength(1);
      expect(movements[0].productId).toEqual(productId);
      expect(movements[0].type).toEqual('IN');
      expect(movements[0].quantity).toEqual(8);
      expect(movements[0].referenceDocType).toEqual('PURCHASE_ORDER');
      expect(movements[0].referenceDocId).toEqual(po.id);
    });

    it('IDEMPOTENCY RULE: Attempting duplicate reception on RECEIVED purchase order is strictly rejected and creates ZERO additional movements', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 5, unitPrice: 500 }],
        },
        fullPermissions
      );

      // First reception -> Success
      PurchaseOrdersService.receive(tenantOrg1, po.id, fullPermissions);
      const initialMovementsCount = PurchaseOrdersService.getStockMovements(tenantOrg1).length;

      // Second reception attempt -> Rejected with PO_ALREADY_RECEIVED
      expect(() => {
        PurchaseOrdersService.receive(tenantOrg1, po.id, fullPermissions);
      }).toThrow('PO_ALREADY_RECEIVED');

      const movementsAfter = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movementsAfter).toHaveLength(initialMovementsCount);
    });
  });

  describe('5. RBAC Permission Enforcement', () => {
    it('should deny PO operations when permission is missing', () => {
      expect(() => {
        PurchaseOrdersService.findAll(tenantOrg1, ['nexus:other:permission']);
      }).toThrow('FORBIDDEN_PERMISSION');

      expect(() => {
        PurchaseOrdersService.create(
          tenantOrg1,
          { supplierId: supplier1Id, lineItems: [{ productServiceId: productId, quantity: 1, unitPrice: 100 }] },
          ['nexus:purchase-orders:read']
        );
      }).toThrow('FORBIDDEN_PERMISSION');
    });
  });

  describe('6. REST PurchaseOrdersController Handler', () => {
    it('should delegate controller operations cleanly with tenant context and RBAC', () => {
      const po = PurchaseOrdersController.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 3, unitPrice: 400 }],
        },
        fullPermissions
      );

      expect(po.id).toBeDefined();

      const fetched = PurchaseOrdersController.getOne(tenantOrg1, po.id, fullPermissions);
      expect(fetched.poNumber).toEqual(po.poNumber);

      const list = PurchaseOrdersController.getAll(tenantOrg1, fullPermissions);
      expect(list.some((p) => p.id === po.id)).toBe(true);

      const received = PurchaseOrdersController.receive(tenantOrg1, po.id, fullPermissions);
      expect(received.status).toEqual('RECEIVED');
    });
  });
});
