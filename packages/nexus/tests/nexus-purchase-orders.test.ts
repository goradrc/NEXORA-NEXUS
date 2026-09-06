import { PurchaseOrdersService } from '../../../apps/api/src/modules/nexus/purchase-orders/purchase-orders.service';
import { PurchaseOrdersController } from '../../../apps/api/src/modules/nexus/purchase-orders/purchase-orders.controller';
import { SuppliersService } from '../../../apps/api/src/modules/nexus/suppliers/suppliers.service';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { CreatePurchaseOrderDto, CreatePurchaseReceiptDto } from '@nexora/nexus';

describe('NEXORA NEXUS — Purchase Orders Module Test Suite (including FRONT-5 2D-C Partial Receipts)', () => {
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
      expect(po.lineItems[0].quantityReceived).toEqual(0);
      expect(po.lineItems[0].quantityRemaining).toEqual(5);
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
        PurchaseOrdersService.createReceipt(
          tenantOrg2,
          po1.id,
          { idempotencyKey: 'key-cross-tenant', lines: [{ lineItemId: po1.lineItems[0].id, quantityReceived: 1 }] },
          fullPermissions
        );
      }).toThrow('PURCHASE_ORDER_NOT_FOUND');
    });
  });

  describe('3. State Machine Transitions & Immutability Locks', () => {
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

    it('IMMUTABILITY LOCK: Disallow update on PARTIALLY_RECEIVED, RECEIVED, or CANCELLED purchase orders', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 10, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      // Partial receipt
      PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-lock-1', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 4 }] },
        fullPermissions
      );

      const fetchedPO = PurchaseOrdersService.findOne(tenantOrg1, po.id, fullPermissions);
      expect(fetchedPO.status).toEqual('PARTIALLY_RECEIVED');

      // Attempt to update supplier / line items on PARTIALLY_RECEIVED PO -> Rejected
      expect(() => {
        PurchaseOrdersService.update(
          tenantOrg1,
          po.id,
          { notes: 'Attempting edit on locked PO' },
          fullPermissions
        );
      }).toThrow('CANNOT_MODIFY_LOCKED_PO');

      // Attempt to cancel PARTIALLY_RECEIVED PO -> Rejected
      expect(() => {
        PurchaseOrdersService.cancel(tenantOrg1, po.id, fullPermissions);
      }).toThrow('INVALID_PO_STATUS_TRANSITION');
    });
  });

  describe('4. FRONT-5 Étape 2D-C — Partial Receipts & Stock Integration Suite', () => {
    it('Scenario 1: Full single receipt transitions status directly to RECEIVED and generates REC-YYYY-XXXX number', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 10, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      const receipt = PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-full-receipt', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 10 }] },
        fullPermissions
      );

      expect(receipt.id).toBeDefined();
      expect(receipt.receiptNumber).toMatch(/^REC-2026-\d{4}$/);

      const updatedPO = PurchaseOrdersService.findOne(tenantOrg1, po.id, fullPermissions);
      expect(updatedPO.status).toEqual('RECEIVED');
      expect(updatedPO.lineItems[0].quantityReceived).toEqual(10);
      expect(updatedPO.lineItems[0].quantityRemaining).toEqual(0);
    });

    it('Scenario 2 & 3: First partial receipt transitions status to PARTIALLY_RECEIVED, second receipt completes to RECEIVED', () => {
      const products = CatalogService.getProductsServices(tenantOrg1, fullPermissions);
      const targetProduct = products.find((p) => p.id === productId)!;
      const initialStock = targetProduct.currentStock;

      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 100, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      // Receipt 1: 40 units
      const receipt1 = PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-part-1', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 40 }] },
        fullPermissions
      );
      expect(receipt1.receiptNumber).toEqual('REC-2026-0001');

      let currentPO = PurchaseOrdersService.findOne(tenantOrg1, po.id, fullPermissions);
      expect(currentPO.status).toEqual('PARTIALLY_RECEIVED');
      expect(currentPO.lineItems[0].quantityReceived).toEqual(40);
      expect(currentPO.lineItems[0].quantityRemaining).toEqual(60);
      expect(targetProduct.currentStock).toEqual(initialStock + 40);

      let movements = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toEqual(40);

      // Receipt 2: Remaining 60 units
      const receipt2 = PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-part-2', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 60 }] },
        fullPermissions
      );
      expect(receipt2.receiptNumber).toEqual('REC-2026-0002');

      currentPO = PurchaseOrdersService.findOne(tenantOrg1, po.id, fullPermissions);
      expect(currentPO.status).toEqual('RECEIVED');
      expect(currentPO.lineItems[0].quantityReceived).toEqual(100);
      expect(currentPO.lineItems[0].quantityRemaining).toEqual(0);
      expect(targetProduct.currentStock).toEqual(initialStock + 100);

      movements = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movements).toHaveLength(2);
      expect(movements[1].quantity).toEqual(60);
    });

    it('Scenario 4 & 5: Reject over-receipt when quantity exceeds remaining balance', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 50, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      // First partial: 30
      PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-over-1', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 30 }] },
        fullPermissions
      );

      // Attempt second receipt: 25 (Remaining is only 20) -> Rejected
      expect(() => {
        PurchaseOrdersService.createReceipt(
          tenantOrg1,
          po.id,
          { idempotencyKey: 'key-over-2', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 25 }] },
          fullPermissions
        );
      }).toThrow('OVER_RECEIPT_EXCEEDED');
    });

    it('Scenario 6: Reject zero or negative receipt quantity', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 10, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      expect(() => {
        PurchaseOrdersService.createReceipt(
          tenantOrg1,
          po.id,
          { idempotencyKey: 'key-zero', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 0 }] },
          fullPermissions
        );
      }).toThrow('INVALID_RECEIPT_QUANTITY');

      expect(() => {
        PurchaseOrdersService.createReceipt(
          tenantOrg1,
          po.id,
          { idempotencyKey: 'key-neg', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: -5 }] },
          fullPermissions
        );
      }).toThrow('INVALID_RECEIPT_QUANTITY');
    });

    it('Scenario 7 & 8: PRODUCT items produce StockMovement IN, SERVICE items produce ZERO stock movements', () => {
      const products = CatalogService.getProductsServices(tenantOrg1, fullPermissions);
      const targetProduct = products.find((p) => p.id === productId)!;
      const initialProductStock = targetProduct.currentStock;

      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [
            { productServiceId: productId, quantity: 10, unitPrice: 500 },
            { productServiceId: serviceId, quantity: 2, unitPrice: 150 },
          ],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      const receipt = PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        {
          idempotencyKey: 'key-mixed',
          lines: [
            { lineItemId: po.lineItems[0].id, quantityReceived: 5 },
            { lineItemId: po.lineItems[1].id, quantityReceived: 2 },
          ],
        },
        fullPermissions
      );

      // Exactly 1 StockMovement for the PRODUCT line
      const movements = PurchaseOrdersService.getStockMovements(tenantOrg1);
      expect(movements).toHaveLength(1);
      expect(movements[0].productId).toEqual(productId);
      expect(movements[0].quantity).toEqual(5);
      expect(movements[0].purchaseReceiptLineId).toEqual(receipt.lines[0].id);

      // Product stock increased by 5, service stock unaffected
      expect(targetProduct.currentStock).toEqual(initialProductStock + 5);
    });

    it('Scenario 11: Idempotency with SAME key + SAME payload returns initial receipt without extra stock impact', () => {
      const products = CatalogService.getProductsServices(tenantOrg1, fullPermissions);
      const targetProduct = products.find((p) => p.id === productId)!;
      const initialStock = targetProduct.currentStock;

      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 20, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      const receiptDto: CreatePurchaseReceiptDto = {
        idempotencyKey: 'key-same-payload-123',
        lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 10 }],
      };

      // Execution 1
      const res1 = PurchaseOrdersService.createReceipt(tenantOrg1, po.id, receiptDto, fullPermissions);
      expect(res1.receiptNumber).toEqual('REC-2026-0001');
      expect(targetProduct.currentStock).toEqual(initialStock + 10);
      expect(PurchaseOrdersService.getStockMovements(tenantOrg1)).toHaveLength(1);

      // Execution 2 (Replay identical payload and key)
      const res2 = PurchaseOrdersService.createReceipt(tenantOrg1, po.id, receiptDto, fullPermissions);
      expect(res2.id).toEqual(res1.id);
      expect(res2.receiptNumber).toEqual(res1.receiptNumber);

      // CRITICAL: Stock stock and movements MUST remain unchanged
      expect(targetProduct.currentStock).toEqual(initialStock + 10);
      expect(PurchaseOrdersService.getStockMovements(tenantOrg1)).toHaveLength(1);
    });

    it('Scenario 12: Idempotency with SAME key + DIFFERENT payload throws IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', () => {
      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 20, unitPrice: 500 }],
        },
        fullPermissions
      );
      PurchaseOrdersService.markOrdered(tenantOrg1, po.id, fullPermissions);

      // Execution 1
      PurchaseOrdersService.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-mismatch-123', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 5 }] },
        fullPermissions
      );

      // Execution 2 (Same key, different quantity)
      expect(() => {
        PurchaseOrdersService.createReceipt(
          tenantOrg1,
          po.id,
          { idempotencyKey: 'key-mismatch-123', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 10 }] },
          fullPermissions
        );
      }).toThrow('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
    });

    it('Scenario 15 & 16: Legacy 2C RECEIVED PO migration creates synthetic receipt with ZERO new stock movements and is re-executable idempotently', () => {
      const productsBefore = CatalogService.getProductsServices(tenantOrg1, fullPermissions);
      const targetProduct = productsBefore.find((p) => p.id === productId)!;
      const stockBeforeMigration = targetProduct.currentStock;

      const po = PurchaseOrdersService.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 15, unitPrice: 500 }],
        },
        fullPermissions
      );
      // Legacy 2C full receipt
      PurchaseOrdersService.receive(tenantOrg1, po.id, fullPermissions);
      const movementsCountBefore = PurchaseOrdersService.getStockMovements(tenantOrg1).length;

      // Execute migration helper
      const synReceipt1 = PurchaseOrdersService.migrateLegacy2CReceivedOrder(tenantOrg1, po.id);
      expect(synReceipt1).not.toBeNull();
      expect(synReceipt1!.receiptNumber).toEqual(`REC-HIST-${po.poNumber}`);

      // Verify ZERO new stock movements and NO stock change
      expect(PurchaseOrdersService.getStockMovements(tenantOrg1)).toHaveLength(movementsCountBefore);
      expect(targetProduct.currentStock).toEqual(stockBeforeMigration + 15);

      // Re-run migration helper (Idempotence test)
      const synReceipt2 = PurchaseOrdersService.migrateLegacy2CReceivedOrder(tenantOrg1, po.id);
      expect(synReceipt2!.id).toEqual(synReceipt1!.id);
      expect(PurchaseOrdersService.getStockMovements(tenantOrg1)).toHaveLength(movementsCountBefore);
    });
  });

  describe('5. REST Controller Integration', () => {
    it('should delegate createReceipt cleanly in PurchaseOrdersController', () => {
      const po = PurchaseOrdersController.create(
        tenantOrg1,
        {
          supplierId: supplier1Id,
          lineItems: [{ productServiceId: productId, quantity: 12, unitPrice: 400 }],
        },
        fullPermissions
      );
      PurchaseOrdersController.markOrdered(tenantOrg1, po.id, fullPermissions);

      const receipt = PurchaseOrdersController.createReceipt(
        tenantOrg1,
        po.id,
        { idempotencyKey: 'key-controller-1', lines: [{ lineItemId: po.lineItems[0].id, quantityReceived: 6 }] },
        fullPermissions
      );

      expect(receipt.id).toBeDefined();
      expect(receipt.receiptNumber).toMatch(/^REC-2026-\d{4}$/);

      const updatedPO = PurchaseOrdersController.getOne(tenantOrg1, po.id, fullPermissions);
      expect(updatedPO.status).toEqual('PARTIALLY_RECEIVED');
      expect(updatedPO.lineItems[0].quantityReceived).toEqual(6);
    });
  });
});
