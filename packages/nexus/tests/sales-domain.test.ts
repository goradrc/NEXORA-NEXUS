import { TenantContext } from '@nexora/core';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { CustomersService } from '../../../apps/api/src/modules/nexus/customers/customers.service';
import { StockService } from '../../../apps/api/src/modules/nexus/stock/stock.service';
import { QuotesService } from '../../../apps/api/src/modules/nexus/quotes/quotes.service';
import { DeliveryNotesService } from '../../../apps/api/src/modules/nexus/delivery-notes/delivery-notes.service';
import { InvoicesService } from '../../../apps/api/src/modules/nexus/invoices/invoices.service';
import { PaymentsService } from '../../../apps/api/src/modules/nexus/payments/payments.service';
import { SalesFinancialService } from '../../../apps/api/src/modules/nexus/sales/financial-calculator';

describe('NEXORA NEXUS — Sales Domain Test Suite (Lot 1 + Lot 2)', () => {
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
    'nexus:quotes:read',
    'nexus:quotes:create',
    'nexus:quotes:update',
    'nexus:quotes:manage',
    'nexus:delivery-notes:read',
    'nexus:delivery-notes:create',
    'nexus:delivery-notes:update',
    'nexus:delivery-notes:manage',
    'nexus:invoices:read',
    'nexus:invoices:create',
    'nexus:invoices:update',
    'nexus:invoices:manage',
    'nexus:payments:read',
    'nexus:payments:create',
    'nexus:payments:cancel',
  ];

  let customerA: any;
  let productA: any;

  beforeEach(() => {
    StockService.clearStoreForTesting();
    QuotesService.clearStoreForTesting();
    DeliveryNotesService.clearStoreForTesting();
    InvoicesService.clearStoreForTesting();
    PaymentsService.clearStoreForTesting();

    customerA = CustomersService.create(
      tenantA,
      { name: 'Customer Test A', companyName: 'Corp A' },
      fullPermissions
    );

    const category = CatalogService.createCategory(
      tenantA,
      { name: 'Hardware', type: 'PRODUCT' },
      fullPermissions
    );

    productA = CatalogService.createProductService(
      tenantA,
      {
        categoryId: category.id,
        type: 'PRODUCT',
        reference: 'PROD-SKU-001',
        name: 'Workstation Laptop',
        salePrice: 1000,
        purchaseCost: 700,
        taxRate: 20,
        currentStock: 10,
        minStockAlert: 2,
      },
      fullPermissions
    );
  });

  describe('1. Sales Financial Calculator & Ad-hoc Lines', () => {
    it('should calculate totals for catalog product lines and ad-hoc custom lines accurately', () => {
      const lineItems = [
        {
          productServiceId: productA.id,
          description: productA.name,
          quantity: 2,
          unitPrice: 1000,
          taxRate: 20,
          discountPercent: 10,
        },
        {
          // Ad-hoc line with productServiceId = undefined
          description: 'Special Delivery & Setup Fee',
          quantity: 1,
          unitPrice: 150,
          taxRate: 20,
          discountPercent: 0,
        },
      ];

      const totals = SalesFinancialService.calculateTotals(lineItems);

      // Line 1: 2 * 1000 * 0.9 = 1800 HT. Tax: 1800 * 0.20 = 360.
      // Line 2: 1 * 150 = 150 HT. Tax: 150 * 0.20 = 30.
      // Total Untaxed: 1950. Total Tax: 390. Total TTC: 2340.
      expect(totals.totalUntaxed).toEqual(1950);
      expect(totals.totalTax).toEqual(390);
      expect(totals.totalAmount).toEqual(2340);
      expect(totals.processedLineItems[1].productServiceId).toBeUndefined();
    });
  });

  describe('2. Quotes Service (Devis)', () => {
    it('should create quote with DEV-YYYY-0001 sequence and keep stock untouched', () => {
      const quote = QuotesService.create(
        tenantA,
        {
          customerId: customerA.id,
          validUntil: '2025-12-31',
          lineItems: [
            {
              productServiceId: productA.id,
              description: productA.name,
              quantity: 2,
              unitPrice: 1000,
              taxRate: 20,
            },
          ],
        },
        fullPermissions
      );

      const year = new Date().getFullYear();
      expect(quote.quoteNumber).toEqual(`DEV-${year}-0001`);
      expect(quote.status).toEqual('DRAFT');

      // Stock must remain unchanged
      expect(productA.currentStock).toEqual(10);
    });

    it('should handle quote status state machine transitions correctly', () => {
      const quote = QuotesService.create(
        tenantA,
        { customerId: customerA.id, validUntil: '2025-12-31', lineItems: [] },
        fullPermissions
      );

      const sent = QuotesService.send(tenantA, quote.id, fullPermissions);
      expect(sent.status).toEqual('SENT');

      const accepted = QuotesService.accept(tenantA, quote.id, fullPermissions);
      expect(accepted.status).toEqual('ACCEPTED');

      const converted = QuotesService.markConverted(tenantA, quote.id, fullPermissions);
      expect(converted.status).toEqual('CONVERTED');

      expect(() => QuotesService.update(tenantA, quote.id, { validUntil: '2026-01-01' }, fullPermissions)).toThrow(
        'QUOTE_LOCKED'
      );
    });
  });

  describe('3. Delivery Notes & Stock OUT Integration', () => {
    it('should deduct stock OUT when delivery note reaches DELIVERED status', () => {
      const bl = DeliveryNotesService.create(
        tenantA,
        {
          customerId: customerA.id,
          lineItems: [
            {
              productServiceId: productA.id,
              description: productA.name,
              quantity: 3,
              unitPrice: 1000,
            },
          ],
        },
        fullPermissions
      );

      expect(bl.status).toEqual('DRAFT');
      expect(productA.currentStock).toEqual(10);

      const delivered = DeliveryNotesService.markDelivered(tenantA, bl.id, fullPermissions);
      expect(delivered.status).toEqual('DELIVERED');

      // Stock decreased from 10 to 7
      expect(productA.currentStock).toEqual(7);

      const movements = StockService.getMovements(tenantA, fullPermissions);
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toEqual('OUT');
      expect(movements[0].quantity).toEqual(3);
    });

    it('should throw INSUFFICIENT_STOCK_ERROR and prevent delivery if stock is insufficient', () => {
      const bl = DeliveryNotesService.create(
        tenantA,
        {
          customerId: customerA.id,
          lineItems: [
            {
              productServiceId: productA.id,
              description: productA.name,
              quantity: 50, // exceeds available 10
              unitPrice: 1000,
            },
          ],
        },
        fullPermissions
      );

      expect(() => DeliveryNotesService.markDelivered(tenantA, bl.id, fullPermissions)).toThrow(
        'INSUFFICIENT_STOCK_ERROR'
      );

      expect(productA.currentStock).toEqual(10); // Unchanged
    });

    it('should reject double delivery attempt on the same Delivery Note', () => {
      const bl = DeliveryNotesService.create(
        tenantA,
        {
          customerId: customerA.id,
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 1, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      DeliveryNotesService.markDelivered(tenantA, bl.id, fullPermissions);
      expect(() => DeliveryNotesService.markDelivered(tenantA, bl.id, fullPermissions)).toThrow(
        'INVALID_STATUS_TRANSITION'
      );
    });
  });

  describe('4. Invoices Service & Commercial Immutability', () => {
    it('should generate zero stock movements for catalog SERVICE items upon issuing invoice', () => {
      const serviceCategory = CatalogService.createCategory(
        tenantA,
        { name: 'Services', type: 'SERVICE' },
        fullPermissions
      );

      const serviceItem = CatalogService.createProductService(
        tenantA,
        {
          categoryId: serviceCategory.id,
          type: 'SERVICE',
          reference: 'SERV-CONSULT-01',
          name: 'IT Architecture Consulting',
          salePrice: 1500,
        },
        fullPermissions
      );

      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          lineItems: [
            { productServiceId: serviceItem.id, description: serviceItem.name, quantity: 5, unitPrice: 1500 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      // Service items produce ZERO stock movements
      expect(StockService.getMovements(tenantA, fullPermissions)).toHaveLength(0);
    });

    it('should issue invoice with FAC-YYYY-0001 sequence and deduct stock OUT for standalone invoice', () => {
      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 2, unitPrice: 1000, taxRate: 20 },
          ],
        },
        fullPermissions
      );

      expect(invoice.status).toEqual('DRAFT');
      expect(productA.currentStock).toEqual(10);

      const issued = InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      const year = new Date().getFullYear();
      expect(issued.invoiceNumber).toEqual(`FAC-${year}-0001`);
      expect(issued.status).toEqual('UNPAID');

      // Stock decreased by 2 (10 -> 8)
      expect(productA.currentStock).toEqual(8);
    });

    it('should enforce INVOICE_LOCKED and reject commercial field updates on issued invoice', () => {
      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 1, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      expect(() =>
        InvoicesService.update(
          tenantA,
          invoice.id,
          { lineItems: [{ description: 'Hacked', quantity: 100, unitPrice: 1 }] },
          fullPermissions
        )
      ).toThrow('INVOICE_LOCKED');
    });

    it('should prevent double stock deduction when invoice is issued for an already delivered BL', () => {
      const bl = DeliveryNotesService.create(
        tenantA,
        {
          customerId: customerA.id,
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 3, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      DeliveryNotesService.markDelivered(tenantA, bl.id, fullPermissions);
      expect(productA.currentStock).toEqual(7); // Deducted 3

      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          deliveryNoteIds: [bl.id],
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 3, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      // Stock MUST remain 7 (0 additional stock OUT)
      expect(productA.currentStock).toEqual(7);
      expect(StockService.getMovements(tenantA, fullPermissions)).toHaveLength(1);
    });

    it('should restore stock via IN movement when a direct standalone invoice is cancelled', () => {
      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 4, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);
      expect(productA.currentStock).toEqual(6); // 10 - 4

      // Cancel direct invoice
      InvoicesService.cancelInvoice(tenantA, invoice.id, 'Customer cancellation', fullPermissions);

      // Stock restored to 10
      expect(productA.currentStock).toEqual(10);
      const movements = StockService.getMovements(tenantA, fullPermissions);
      expect(movements).toHaveLength(2); // 1 OUT, 1 IN
      expect(movements[1].type).toEqual('IN');
      expect(movements[1].quantity).toEqual(4);
    });

    it('should NOT touch stock when an invoice linked to a delivered BL is cancelled', () => {
      const bl = DeliveryNotesService.create(
        tenantA,
        {
          customerId: customerA.id,
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 3, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      DeliveryNotesService.markDelivered(tenantA, bl.id, fullPermissions);
      expect(productA.currentStock).toEqual(7);

      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          deliveryNoteIds: [bl.id],
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 3, unitPrice: 1000 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);
      expect(productA.currentStock).toEqual(7);

      // Cancel invoice linked to delivered BL
      InvoicesService.cancelInvoice(tenantA, invoice.id, 'Billing error', fullPermissions);

      // Stock remains 7 because BL was delivered
      expect(productA.currentStock).toEqual(7);
      expect(StockService.getMovements(tenantA, fullPermissions)).toHaveLength(1); // Only initial BL OUT
    });

    it('should handle concurrent stock OUT requests atomically and reject requests exceeding stock', async () => {
      // productA currentStock = 10. Run 3 concurrent requests of 4 units each (total 12 requested).
      // Exactly 2 requests should succeed (8 units deducted), and 1 should fail with INSUFFICIENT_STOCK_ERROR.
      const results = await Promise.allSettled([
        Promise.resolve().then(() =>
          StockService.recordOutMovement(
            tenantA,
            { productId: productA.id, quantity: 4, referenceDocType: 'TEST', referenceDocId: 't1' },
            fullPermissions
          )
        ),
        Promise.resolve().then(() =>
          StockService.recordOutMovement(
            tenantA,
            { productId: productA.id, quantity: 4, referenceDocType: 'TEST', referenceDocId: 't2' },
            fullPermissions
          )
        ),
        Promise.resolve().then(() =>
          StockService.recordOutMovement(
            tenantA,
            { productId: productA.id, quantity: 4, referenceDocType: 'TEST', referenceDocId: 't3' },
            fullPermissions
          )
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(1);
      expect(productA.currentStock).toEqual(2); // 10 - 8 = 2
    });
  });

  describe('5. Payments Service & Customer Balance', () => {
    it('should record payment, update invoice status/settlement, and decrease customer balance', () => {
      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 1, unitPrice: 1000, taxRate: 0 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      // Customer debt balance updated to 1000
      const customerBefore = CustomersService.findOne(tenantA, customerA.id, fullPermissions);
      expect(customerBefore.balance).toEqual(1000);

      // Record partial payment 400
      const payment1 = PaymentsService.createPayment(
        tenantA,
        { invoiceId: invoice.id, amount: 400, paymentMethod: 'BANK_TRANSFER' },
        fullPermissions
      );

      const year = new Date().getFullYear();
      expect(payment1.paymentNumber).toEqual(`PAY-${year}-0001`);

      const invCheck1 = InvoicesService.findOne(tenantA, invoice.id, fullPermissions);
      expect(invCheck1.amountPaid).toEqual(400);
      expect(invCheck1.amountDue).toEqual(600);
      expect(invCheck1.status).toEqual('PARTIAL');

      const customerCheck1 = CustomersService.findOne(tenantA, customerA.id, fullPermissions);
      expect(customerCheck1.balance).toEqual(600);

      // Record remaining payment 600
      PaymentsService.createPayment(
        tenantA,
        { invoiceId: invoice.id, amount: 600, paymentMethod: 'CASH' },
        fullPermissions
      );

      const invCheck2 = InvoicesService.findOne(tenantA, invoice.id, fullPermissions);
      expect(invCheck2.amountPaid).toEqual(1000);
      expect(invCheck2.amountDue).toEqual(0);
      expect(invCheck2.status).toEqual('PAID');

      const customerCheck2 = CustomersService.findOne(tenantA, customerA.id, fullPermissions);
      expect(customerCheck2.balance).toEqual(0);
    });

    it('should reject overpayment exceeding invoice amount due', () => {
      const invoice = InvoicesService.create(
        tenantA,
        {
          customerId: customerA.id,
          dueDate: '2025-12-31',
          lineItems: [
            { productServiceId: productA.id, description: productA.name, quantity: 1, unitPrice: 500, taxRate: 0 },
          ],
        },
        fullPermissions
      );

      InvoicesService.issueInvoice(tenantA, invoice.id, fullPermissions);

      expect(() =>
        PaymentsService.createPayment(
          tenantA,
          { invoiceId: invoice.id, amount: 1000, paymentMethod: 'CASH' },
          fullPermissions
        )
      ).toThrow('OVERPAYMENT_NOT_ALLOWED');
    });
  });

  describe('6. Security RBAC & Multi-Tenant Isolation', () => {
    it('should enforce RBAC permissions and throw FORBIDDEN_PERMISSION if user lacks required permission', () => {
      const restrictedPermissions = ['nexus:quotes:read'];

      expect(() =>
        QuotesService.create(
          tenantA,
          { customerId: customerA.id, validUntil: '2025-12-31', lineItems: [] },
          restrictedPermissions
        )
      ).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should enforce strict tenant isolation and reject cross-tenant resource access', () => {
      expect(() =>
        QuotesService.create(
          tenantB, // Tenant B attempting to create quote for Tenant A's customer
          { customerId: customerA.id, validUntil: '2025-12-31', lineItems: [] },
          fullPermissions
        )
      ).toThrow('CUSTOMER_NOT_FOUND');
    });
  });
});
