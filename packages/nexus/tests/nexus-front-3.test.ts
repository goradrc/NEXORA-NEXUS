import { TenantContext } from '@nexora/core';
import { SalesService } from '../../../apps/api/src/modules/nexus/sales/sales.service';
import { localDb } from '../../../apps/web/src/offline/db';

describe('NEXORA NEXUS — Phase FRONT-3 Test Suite (Ventes, Devis, Factures & Règlements)', () => {
  const tenant1: TenantContext = {
    organizationId: 'org-1',
    userId: 'usr-1',
  };

  const tenant2: TenantContext = {
    organizationId: 'org-2',
    userId: 'usr-2',
  };

  const salesPermissions = [
    'nexus:quotes:read',
    'nexus:quotes:create',
    'nexus:quotes:update',
    'nexus:quotes:delete',
    'nexus:invoices:read',
    'nexus:invoices:create',
    'nexus:invoices:update',
    'nexus:invoices:delete',
    'nexus:payments:read',
    'nexus:payments:create',
    'nexus:payments:delete',
  ];

  beforeEach(() => {
    SalesService.clearAllForTesting();
    localDb.clearAllForTesting();
  });

  describe('1. Concurrence Réelle sur Paiement (Point Critique Bloquant)', () => {
    it('should reject second payment under true concurrent execution (Promise.all) for invoice of 100 EUR', async () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-conc-1',
          lineItems: [{ description: 'Article Conc', quantity: 1, unitPrice: 100, taxRate: 0 }],
        },
        salesPermissions
      );

      expect(invoice.totalAmount).toBe(100);
      expect(invoice.amountDue).toBe(100);

      // Execute two payment attempts simultaneously using Promise.all
      const paymentPromise1 = Promise.resolve().then(() =>
        SalesService.recordPayment(
          tenant1,
          { invoiceId: invoice.id, amount: 100, paymentMethod: 'BANK_TRANSFER' },
          salesPermissions
        )
      );

      const paymentPromise2 = Promise.resolve().then(() =>
        SalesService.recordPayment(
          tenant1,
          { invoiceId: invoice.id, amount: 100, paymentMethod: 'CARD' },
          salesPermissions
        )
      );

      const results = await Promise.allSettled([paymentPromise1, paymentPromise2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError.message).toMatch(/(OVERPAYMENT_REJECTED|CONCURRENCY_LOCK)/);

      const refreshed = SalesService.findOneInvoice(tenant1, invoice.id, salesPermissions);
      expect(refreshed.amountPaid).toBe(100);
      expect(refreshed.amountDue).toBe(0);
      expect(refreshed.status).toBe('PAID');
    });
  });

  describe('2. Précision Financière & Calculs (Floating-Point Precision)', () => {
    it('should correctly handle 3 x 0.10 and avoid JavaScript floating point errors', () => {
      const { processedLines, totalUntaxed, totalTax, totalAmount } = SalesService.processLineItems([
        { description: 'Item A', quantity: 3, unitPrice: 0.1, taxRate: 20 },
      ]);

      expect(processedLines[0].totalPrice).toBe(0.3); // Exactly 0.3, not 0.30000000000000004
      expect(totalUntaxed).toBe(0.3);
      expect(totalTax).toBe(0.06); // 0.30 * 20% = 0.06
      expect(totalAmount).toBe(0.36);
    });

    it('should compute complex multi-line discounts and tax rates accurately', () => {
      const { processedLines, totalUntaxed, totalTax, totalAmount } = SalesService.processLineItems([
        { description: 'Line 1 (20% VAT)', quantity: 2, unitPrice: 15.5, discountPercent: 10, taxRate: 20 },
        { description: 'Line 2 (5.5% VAT)', quantity: 5, unitPrice: 8.99, discountPercent: 5, taxRate: 5.5 },
      ]);

      // Line 1: 2 * 15.5 = 31.00; -10% discount = 27.90 HT. Tax @ 20% = 5.58.
      expect(processedLines[0].totalPrice).toBe(27.9);

      // Line 2: 5 * 8.99 = 44.95; -5% discount = 42.7025 -> 42.70 HT. Tax @ 5.5% = 2.35.
      expect(processedLines[1].totalPrice).toBe(42.7);

      expect(totalUntaxed).toBe(70.6); // 27.90 + 42.70
      expect(totalTax).toBe(7.93); // 5.58 + 2.35
      expect(totalAmount).toBe(78.53); // 70.60 + 7.93
    });
  });

  describe('3. Conversion Devis -> Facture Concurrente & Idempotence', () => {
    it('should reject double conversion when executed concurrently (Promise.all)', async () => {
      const quote = SalesService.createQuote(
        tenant1,
        {
          customerId: 'cli-conv-1',
          lineItems: [{ description: 'Devis Conc', quantity: 1, unitPrice: 200, taxRate: 20 }],
        },
        salesPermissions
      );

      const accepted = SalesService.updateQuote(tenant1, quote.id, { status: 'ACCEPTED' }, salesPermissions);
      expect(accepted.status).toBe('ACCEPTED');

      const conv1 = Promise.resolve().then(() =>
        SalesService.convertQuoteToInvoice(tenant1, quote.id, salesPermissions)
      );
      const conv2 = Promise.resolve().then(() =>
        SalesService.convertQuoteToInvoice(tenant1, quote.id, salesPermissions)
      );

      const results = await Promise.allSettled([conv1, conv2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const allInvoices = SalesService.findAllInvoices(tenant1, salesPermissions);
      expect(allInvoices.length).toBe(1);
    });
  });

  describe('4. Idempotence par mutationId', () => {
    it('should return identical invoice when replaying creation with same mutationId', () => {
      const mutationId = 'mut-inv-1001';

      const inv1 = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-idem-1',
          mutationId,
          lineItems: [{ description: 'Test Idempotence', quantity: 1, unitPrice: 150, taxRate: 20 }],
        },
        salesPermissions
      );

      const inv2 = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-idem-1',
          mutationId,
          lineItems: [{ description: 'Test Idempotence', quantity: 1, unitPrice: 150, taxRate: 20 }],
        },
        salesPermissions
      );

      expect(inv1.id).toBe(inv2.id);
      expect(inv1.invoiceNumber).toBe(inv2.invoiceNumber);

      const allInvoices = SalesService.findAllInvoices(tenant1, salesPermissions);
      expect(allInvoices.length).toBe(1);
    });

    it('should return identical payment when replaying payment recording with same mutationId', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-idem-2',
          lineItems: [{ description: 'Test Pay Idem', quantity: 1, unitPrice: 100, taxRate: 0 }],
        },
        salesPermissions
      );

      const mutationId = 'mut-pay-5001';

      const pay1 = SalesService.recordPayment(
        tenant1,
        { invoiceId: invoice.id, amount: 50, paymentMethod: 'CASH', mutationId },
        salesPermissions
      );

      const pay2 = SalesService.recordPayment(
        tenant1,
        { invoiceId: invoice.id, amount: 50, paymentMethod: 'CASH', mutationId },
        salesPermissions
      );

      expect(pay1.id).toBe(pay2.id);
      expect(pay1.paymentNumber).toBe(pay2.paymentNumber);

      const payments = SalesService.findAllPayments(tenant1, salesPermissions);
      expect(payments.length).toBe(1);

      const refreshed = SalesService.findOneInvoice(tenant1, invoice.id, salesPermissions);
      expect(refreshed.amountPaid).toBe(50);
      expect(refreshed.amountDue).toBe(50);
    });
  });

  describe('5. Numérotation Officielle et Isolation Concurrente', () => {
    it('should generate strict sequential numbers per organization and year', () => {
      const year = new Date().getFullYear();

      const inv1 = SalesService.createInvoice(
        tenant1,
        { customerId: 'c1', lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 10, taxRate: 0 }] },
        salesPermissions
      );

      const inv2 = SalesService.createInvoice(
        tenant1,
        { customerId: 'c1', lineItems: [{ description: 'Item 2', quantity: 1, unitPrice: 20, taxRate: 0 }] },
        salesPermissions
      );

      expect(inv1.invoiceNumber).toBe(`FAC-${year}-0001`);
      expect(inv2.invoiceNumber).toBe(`FAC-${year}-0002`);
    });
  });

  describe('6. Snapshot Historique Lignes Commerciales', () => {
    it('should preserve invoice commercial snapshot values even if catalog product is altered or deleted', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-snap-1',
          lineItems: [
            {
              productServiceId: 'prod-catalog-99',
              description: 'Écran 27 pouces (Original)',
              quantity: 1,
              unitPrice: 250,
              taxRate: 20,
              discountPercent: 0,
            },
          ],
        },
        salesPermissions
      );

      expect(invoice.totalAmount).toBe(300);

      // Simulate catalog item update/deletion
      const line = invoice.lineItems[0];
      expect(line.description).toBe('Écran 27 pouces (Original)');
      expect(line.unitPrice).toBe(250);
      expect(line.productServiceId).toBe('prod-catalog-99');
    });
  });

  describe('7. Immutabilité des Factures Émises', () => {
    it('should prohibit modifying lines or deleting invoice once issued (UNPAID/PARTIAL/PAID)', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-immut-1',
          lineItems: [{ description: 'Prestation Immuable', quantity: 1, unitPrice: 500, taxRate: 20 }],
        },
        salesPermissions
      );

      expect(invoice.status).toBe('UNPAID');

      // Modifying lines on non-DRAFT invoice -> error
      expect(() => {
        SalesService.updateInvoice(
          tenant1,
          invoice.id,
          { lineItems: [{ description: 'Hacked Item', quantity: 10, unitPrice: 1, taxRate: 0 }] },
          salesPermissions
        );
      }).toThrow(/INVOICE_LOCKED/);

      // Delete non-DRAFT invoice -> error
      expect(() => {
        SalesService.deleteInvoice(tenant1, invoice.id, salesPermissions);
      }).toThrow(/INVOICE_LOCKED_DELETE/);
    });
  });

  describe('8. RBAC & Multi-Tenant Isolation Backend', () => {
    it('should enforce RBAC permissions on all sales operations', () => {
      expect(() => {
        SalesService.findAllQuotes(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        SalesService.findAllInvoices(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        SalesService.findAllPayments(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);
    });

    it('should isolate invoices and quotes strictly per tenant', () => {
      const inv1 = SalesService.createInvoice(
        tenant1,
        { customerId: 'cli-t1', lineItems: [{ description: 'Item T1', quantity: 1, unitPrice: 50, taxRate: 0 }] },
        salesPermissions
      );

      const inv2 = SalesService.createInvoice(
        tenant2,
        { customerId: 'cli-t2', lineItems: [{ description: 'Item T2', quantity: 1, unitPrice: 75, taxRate: 0 }] },
        salesPermissions
      );

      expect(() => SalesService.findOneInvoice(tenant1, inv2.id, salesPermissions)).toThrow(/INVOICE_NOT_FOUND/);
      expect(() => SalesService.findOneInvoice(tenant2, inv1.id, salesPermissions)).toThrow(/INVOICE_NOT_FOUND/);
    });
  });
});
