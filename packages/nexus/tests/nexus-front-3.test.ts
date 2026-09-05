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

  describe('1. Module Devis (Quotes)', () => {
    it('should create a quote with auto-generated sequential number DEV-YYYY-XXXX', () => {
      const year = new Date().getFullYear();
      const quote = SalesService.createQuote(
        tenant1,
        {
          customerId: 'cli-101',
          lineItems: [
            {
              productServiceId: 'prod-01',
              description: 'Prestation Conseil ERP',
              quantity: 5,
              unitPrice: 100,
              taxRate: 20,
              discountPercent: 10,
            },
          ],
        },
        salesPermissions
      );

      expect(quote.quoteNumber).toBe(`DEV-${year}-0001`);
      expect(quote.status).toBe('DRAFT');
      expect(quote.totalUntaxed).toBe(450); // 5 * 100 * 0.9 = 450
      expect(quote.totalTax).toBe(90); // 450 * 0.20 = 90
      expect(quote.totalAmount).toBe(540);
      expect(quote.lineItems[0].unitPrice).toBe(100);
      expect(quote.lineItems[0].discountPercent).toBe(10);
    });

    it('should convert an ACCEPTED quote to an official Invoice and lock quote status as CONVERTED', () => {
      const quote = SalesService.createQuote(
        tenant1,
        {
          customerId: 'cli-101',
          lineItems: [
            { productServiceId: 'prod-02', description: 'Licence Nexora Nexus', quantity: 2, unitPrice: 500, taxRate: 20 },
          ],
        },
        salesPermissions
      );

      // Transition to ACCEPTED via updateQuote
      const accepted = SalesService.updateQuote(tenant1, quote.id, { status: 'ACCEPTED' }, salesPermissions);
      expect(accepted.status).toBe('ACCEPTED');

      // Convert quote to invoice
      const invoice = SalesService.convertQuoteToInvoice(tenant1, quote.id, salesPermissions);
      expect(invoice.invoiceNumber).toContain(`FAC-${new Date().getFullYear()}-`);
      expect(invoice.customerId).toBe('cli-101');
      expect(invoice.totalUntaxed).toBe(1000);
      expect(invoice.totalAmount).toBe(1200);

      // Verify quote is now CONVERTED
      const updatedQuote = SalesService.findOneQuote(tenant1, quote.id, salesPermissions);
      expect(updatedQuote?.status).toBe('CONVERTED');
    });

    it('should prevent converting an already CONVERTED quote to an Invoice', () => {
      const quote = SalesService.createQuote(
        tenant1,
        {
          customerId: 'cli-101',
          lineItems: [{ productServiceId: 'prod-03', description: 'Test draft', quantity: 1, unitPrice: 100, taxRate: 20 }],
        },
        salesPermissions
      );

      SalesService.convertQuoteToInvoice(tenant1, quote.id, salesPermissions);

      expect(() => {
        SalesService.convertQuoteToInvoice(tenant1, quote.id, salesPermissions);
      }).toThrow(/QUOTE_ALREADY_CONVERTED/);
    });
  });

  describe('2. Module Factures (Invoices) & Immuabilité', () => {
    it('should create invoice and snapshot commercial line item values', () => {
      const year = new Date().getFullYear();
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-201',
          lineItems: [
            {
              productServiceId: 'prod-laptop',
              description: 'Laptop Pro i7 16GB',
              quantity: 2,
              unitPrice: 1200,
              taxRate: 20,
              discountPercent: 5,
            },
          ],
        },
        salesPermissions
      );

      expect(invoice.invoiceNumber).toBe(`FAC-${year}-0001`);
      expect(invoice.status).toBe('UNPAID');
      expect(invoice.amountPaid).toBe(0);
      expect(invoice.amountDue).toBe(2736); // 2 * 1200 * 0.95 = 2280 HT + 456 TVA = 2736 TTC

      // Verify commercial snapshot values inside lineItems
      const line = invoice.lineItems[0];
      expect(line.productServiceId).toBe('prod-laptop');
      expect(line.unitPrice).toBe(1200);
      expect(line.discountPercent).toBe(5);
      expect(line.taxRate).toBe(20);
      expect(line.totalPrice).toBe(2280);
    });

    it('should enforce anti-fraud immuability: prohibit updating line items on non-DRAFT invoice', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-201',
          lineItems: [{ productServiceId: 'serv-01', description: 'Service A', quantity: 1, unitPrice: 300, taxRate: 20 }],
        },
        salesPermissions
      );

      expect(invoice.status).toBe('UNPAID');

      // Attempt to modify line items on non-DRAFT invoice
      expect(() => {
        SalesService.updateInvoice(
          tenant1,
          invoice.id,
          {
            lineItems: [{ productServiceId: 'serv-01', description: 'Service Altered', quantity: 5, unitPrice: 10, taxRate: 0 }],
          },
          salesPermissions
        );
      }).toThrow(/INVOICE_LOCKED/);
    });

    it('should isolate invoices and quotes strictly per organization (Tenant Isolation)', () => {
      const inv1 = SalesService.createInvoice(
        tenant1,
        { customerId: 'cli-t1', lineItems: [{ productServiceId: 'p1', description: 'Item T1', quantity: 1, unitPrice: 50, taxRate: 20 }] },
        salesPermissions
      );

      const inv2 = SalesService.createInvoice(
        tenant2,
        { customerId: 'cli-t2', lineItems: [{ productServiceId: 'p2', description: 'Item T2', quantity: 1, unitPrice: 75, taxRate: 20 }] },
        salesPermissions
      );

      const tenant1Invoices = SalesService.findAllInvoices(tenant1, salesPermissions);
      const tenant2Invoices = SalesService.findAllInvoices(tenant2, salesPermissions);

      expect(tenant1Invoices.some((i) => i.id === inv1.id)).toBe(true);
      expect(tenant1Invoices.some((i) => i.id === inv2.id)).toBe(false);

      expect(tenant2Invoices.some((i) => i.id === inv2.id)).toBe(true);
      expect(tenant2Invoices.some((i) => i.id === inv1.id)).toBe(false);
    });
  });

  describe('3. Module Règlements (Payments) & Strict Anti-Overpayment', () => {
    it('should record partial payment and update invoice amountPaid, amountDue, and PARTIAL status', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-301',
          lineItems: [{ productServiceId: 'serv-02', description: 'Formation Nexus', quantity: 1, unitPrice: 1000, taxRate: 20 }],
        },
        salesPermissions
      );

      expect(invoice.totalAmount).toBe(1200);

      const payment1 = SalesService.recordPayment(
        tenant1,
        {
          invoiceId: invoice.id,
          amount: 500,
          paymentMethod: 'BANK_TRANSFER',
          referenceCode: 'VIR-001',
        },
        salesPermissions
      );

      expect(payment1.paymentNumber).toContain(`PAY-${new Date().getFullYear()}-`);
      expect(payment1.amount).toBe(500);

      const refreshed = SalesService.findOneInvoice(tenant1, invoice.id, salesPermissions);
      expect(refreshed?.amountPaid).toBe(500);
      expect(refreshed?.amountDue).toBe(700);
      expect(refreshed?.status).toBe('PARTIAL');
    });

    it('should record remaining payment and set invoice status to PAID', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-301',
          lineItems: [{ productServiceId: 'prod-04', description: 'Matériel IT', quantity: 1, unitPrice: 500, taxRate: 20 }],
        },
        salesPermissions
      );

      expect(invoice.totalAmount).toBe(600);

      SalesService.recordPayment(
        tenant1,
        { invoiceId: invoice.id, amount: 600, paymentMethod: 'CARD' },
        salesPermissions
      );

      const refreshed = SalesService.findOneInvoice(tenant1, invoice.id, salesPermissions);
      expect(refreshed?.amountPaid).toBe(600);
      expect(refreshed?.amountDue).toBe(0);
      expect(refreshed?.status).toBe('PAID');
    });

    it('should strictly reject overpayment exceeding invoice balance (OVERPAYMENT_REJECTED)', () => {
      const invoice = SalesService.createInvoice(
        tenant1,
        {
          customerId: 'cli-301',
          lineItems: [{ productServiceId: 'lic-01', description: 'Licence logicielle', quantity: 1, unitPrice: 100, taxRate: 20 }],
        },
        salesPermissions
      );

      expect(invoice.totalAmount).toBe(120);

      // Attempt to pay 150 EUR on a 120 EUR invoice
      expect(() => {
        SalesService.recordPayment(
          tenant1,
          { invoiceId: invoice.id, amount: 150, paymentMethod: 'CASH' },
          salesPermissions
        );
      }).toThrow(/OVERPAYMENT_REJECTED/);
    });

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
  });
});
