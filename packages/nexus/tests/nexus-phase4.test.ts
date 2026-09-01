import { TenantContext, AuditService, PdfService } from '@nexora/core';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { StockService } from '../../../apps/api/src/modules/nexus/stock/stock.service';
import { CustomersService } from '../../../apps/api/src/modules/nexus/customers/customers.service';
import { QuotesService } from '../../../apps/api/src/modules/nexus/quotes/quotes.service';
import { InvoicesService } from '../../../apps/api/src/modules/nexus/invoices/invoices.service';
import { PaymentsService } from '../../../apps/api/src/modules/nexus/payments/payments.service';
import { QuoteStatus, InvoiceStatus, PaymentMethod } from '../src';
import { NexoraLocalDatabase } from '../../../apps/web/src/offline/db';

describe('NEXORA NEXUS — Phase 4 Test Suite (Devis, Facturation, Ventes & Paiements)', () => {
  const tenantA: TenantContext = { organizationId: 'org-tenant-A', userId: 'usr-1' };
  const tenantB: TenantContext = { organizationId: 'org-tenant-B', userId: 'usr-2' };

  const permsAdmin = [
    'nexus:catalog:read', 'nexus:catalog:create',
    'nexus:stock:read', 'nexus:stock:create',
    'nexus:customers:read', 'nexus:customers:create', 'nexus:customers:update',
    'nexus:quotes:read', 'nexus:quotes:create', 'nexus:quotes:update',
    'nexus:invoices:read', 'nexus:invoices:create', 'nexus:invoices:update',
    'nexus:payments:read', 'nexus:payments:create',
  ];

  const permsReadOnly = ['nexus:quotes:read', 'nexus:invoices:read', 'nexus:payments:read'];

  let catId: string;
  let prodPhysicalId: string;
  let prodServiceId: string;
  let customerAId: string;

  beforeEach(() => {
    StockService.clearStoreForTesting();
    QuotesService.clearStoreForTesting();
    InvoicesService.clearStoreForTesting();
    PaymentsService.clearStoreForTesting();

    // Setup seed data
    const cat = CatalogService.createCategory(tenantA, { name: 'IT Equipment', type: 'PRODUCT' }, permsAdmin);
    catId = cat.id;

    const prod = CatalogService.createProductService(
      tenantA,
      {
        categoryId: catId,
        type: 'PRODUCT',
        reference: 'LAPTOP-PRO-15',
        name: 'Pro Laptop 15 inch',
        salePrice: 1000,
        purchaseCost: 700,
        currentStock: 20,
        minStockAlert: 5,
      },
      permsAdmin
    );
    prodPhysicalId = prod.id;

    const service = CatalogService.createProductService(
      tenantA,
      {
        categoryId: catId,
        type: 'SERVICE',
        reference: 'SERVICE-INSTALL',
        name: 'Setup & Installation Service',
        salePrice: 200,
        purchaseCost: 0,
      },
      permsAdmin
    );
    prodServiceId = service.id;

    const customer = CustomersService.create(
      tenantA,
      { name: 'Acme Corp Solutions', companyName: 'Acme Corp', email: 'billing@acme.com' },
      permsAdmin
    );
    customerAId = customer.id;
  });

  describe('1. Quotes & Proformas Engine', () => {
    it('should calculate quote total untaxed, tax and total amount with discounts', () => {
      const quote = QuotesService.createQuote(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          lineItems: [
            {
              productServiceId: prodPhysicalId,
              description: 'Pro Laptop 15 inch',
              quantity: 2,
              unitPrice: 1000,
              taxRate: 20, // 20% VAT
              discountPercent: 10, // 10% discount -> 900 HT unit * 2 = 1800 HT
            },
            {
              productServiceId: prodServiceId,
              description: 'Setup & Installation Service',
              quantity: 1,
              unitPrice: 200,
              taxRate: 20, // 200 HT -> 40 VAT -> 240 TTC
            },
          ],
        },
        permsAdmin
      );

      expect(quote.quoteNumber).toMatch(/^DEV-\d{4}-\d{3}$/);
      expect(quote.status).toEqual(QuoteStatus.DRAFT);
      expect(quote.totalUntaxed).toEqual(2000); // 1800 + 200
      expect(quote.totalTax).toEqual(400); // 360 + 40
      expect(quote.totalAmount).toEqual(2400); // 2000 + 400
    });

    it('should reject empty quote with no line items', () => {
      expect(() => {
        QuotesService.createQuote(
          tenantA,
          {
            organizationId: tenantA.organizationId,
            customerId: customerAId,
            lineItems: [],
          },
          permsAdmin
        );
      }).toThrow('EMPTY_QUOTE');
    });

    it('should update quote status and enforce multi-tenant isolation', () => {
      const quote = QuotesService.createQuote(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          lineItems: [
            { productServiceId: prodServiceId, description: 'Consulting', quantity: 5, unitPrice: 100, taxRate: 20 },
          ],
        },
        permsAdmin
      );

      QuotesService.updateQuoteStatus(tenantA, quote.id, QuoteStatus.ACCEPTED, permsAdmin);
      const updated = QuotesService.getQuoteById(tenantA, quote.id, permsAdmin);
      expect(updated?.status).toEqual(QuoteStatus.ACCEPTED);

      // Tenant B should not see Tenant A quote
      const quotesB = QuotesService.getQuotes(tenantB, permsAdmin);
      expect(quotesB).toHaveLength(0);
    });
  });

  describe('2. Invoices & Sales Execution Engine', () => {
    it('should generate sequential invoice number, auto-deduct physical stock and set UNPAID status', () => {
      const initialStock = CatalogService.getProductsServices(tenantA, permsAdmin).find(p => p.id === prodPhysicalId)?.currentStock;
      expect(initialStock).toEqual(20);

      const invoice = InvoicesService.createInvoice(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          lineItems: [
            { productServiceId: prodPhysicalId, description: 'Pro Laptop 15', quantity: 3, unitPrice: 1000, taxRate: 20 },
          ],
        },
        permsAdmin
      );

      expect(invoice.invoiceNumber).toMatch(/^FAC-\d{4}-\d{3}$/);
      expect(invoice.status).toEqual(InvoiceStatus.UNPAID);
      expect(invoice.totalUntaxed).toEqual(3000);
      expect(invoice.totalTax).toEqual(600);
      expect(invoice.totalAmount).toEqual(3600);
      expect(invoice.amountPaid).toEqual(0);
      expect(invoice.amountDue).toEqual(3600);

      // Check physical product stock was deducted by 3
      const updatedStock = CatalogService.getProductsServices(tenantA, permsAdmin).find(p => p.id === prodPhysicalId)?.currentStock;
      expect(updatedStock).toEqual(17); // 20 - 3
    });

    it('should convert an ACCEPTED quote directly into an invoice', () => {
      const quote = QuotesService.createQuote(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          lineItems: [
            { productServiceId: prodServiceId, description: 'Installation', quantity: 2, unitPrice: 150, taxRate: 20 },
          ],
        },
        permsAdmin
      );

      QuotesService.updateQuoteStatus(tenantA, quote.id, QuoteStatus.ACCEPTED, permsAdmin);

      const invoice = InvoicesService.createInvoiceFromQuote(tenantA, quote.id, permsAdmin);
      expect(invoice.quoteId).toEqual(quote.id);
      expect(invoice.totalAmount).toEqual(360);

      const convertedQuote = QuotesService.getQuoteById(tenantA, quote.id, permsAdmin);
      expect(convertedQuote?.status).toEqual(QuoteStatus.CONVERTED);
    });
  });

  describe('3. Payments & Customer Balance Settlement Engine', () => {
    it('should handle partial payment then full payment, updating invoice status and customer balance', () => {
      const invoice = InvoicesService.createInvoice(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          lineItems: [
            { productServiceId: prodServiceId, description: 'Software License', quantity: 1, unitPrice: 1000, taxRate: 20 },
          ],
        },
        permsAdmin
      ); // Total TTC = 1200

      // Initial Customer Balance update
      CustomersService.update(tenantA, customerAId, { balance: 1200 }, permsAdmin);

      // Partial Payment of 500
      const payment1 = PaymentsService.createPayment(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          invoiceId: invoice.id,
          amount: 500,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          referenceCode: 'VIR-1001',
        },
        permsAdmin
      );

      expect(payment1.paymentNumber).toMatch(/^PAY-\d{4}-\d{3}$/);

      const invAfterPart = InvoicesService.getInvoiceById(tenantA, invoice.id, permsAdmin);
      expect(invAfterPart?.status).toEqual(InvoiceStatus.PARTIAL);
      expect(invAfterPart?.amountPaid).toEqual(500);
      expect(invAfterPart?.amountDue).toEqual(700);

      const custAfterPart = CustomersService.findOne(tenantA, customerAId, permsAdmin);
      expect(custAfterPart.balance).toEqual(700); // 1200 - 500

      // Final Payment of 700
      PaymentsService.createPayment(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          invoiceId: invoice.id,
          amount: 700,
          paymentMethod: PaymentMethod.CASH,
        },
        permsAdmin
      );

      const invAfterFull = InvoicesService.getInvoiceById(tenantA, invoice.id, permsAdmin);
      expect(invAfterFull?.status).toEqual(InvoiceStatus.PAID);
      expect(invAfterFull?.amountPaid).toEqual(1200);
      expect(invAfterFull?.amountDue).toEqual(0);

      const custAfterFull = CustomersService.findOne(tenantA, customerAId, permsAdmin);
      expect(custAfterFull.balance).toEqual(0);
    });

    it('should throw OVERPAYMENT_EXCEEDED error when payment amount exceeds remaining invoice balance', () => {
      const invoice = InvoicesService.createInvoice(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          lineItems: [
            { productServiceId: prodServiceId, description: 'Service', quantity: 1, unitPrice: 100, taxRate: 0 },
          ],
        },
        permsAdmin
      ); // Total = 100

      expect(() => {
        PaymentsService.createPayment(
          tenantA,
          {
            organizationId: tenantA.organizationId,
            customerId: customerAId,
            invoiceId: invoice.id,
            amount: 150, // Exceeds 100
            paymentMethod: PaymentMethod.CARD,
          },
          permsAdmin
        );
      }).toThrow('OVERPAYMENT_EXCEEDED');
    });
  });

  describe('4. PDF Document Generation Engine', () => {
    it('should render HTML document with header, customer, line items and totals', () => {
      const html = PdfService.generateDocumentHtml({
        title: 'FACTURE',
        documentNumber: 'FAC-2025-001',
        date: new Date('2025-09-01'),
        dueDate: new Date('2025-10-01'),
        organization: {
          name: 'NEXORA Corporation',
          taxId: 'NIF-99887766',
        },
        customer: {
          name: 'Acme Corp Solutions',
          companyName: 'Acme Corp',
        },
        lineItems: [
          { description: 'Pro Laptop 15', quantity: 2, unitPrice: 1000, taxRate: 20, totalPrice: 2400 },
        ],
        totalUntaxed: 2000,
        totalTax: 400,
        totalAmount: 2400,
        currency: 'EUR',
      });

      expect(html).toContain('FACTURE');
      expect(html).toContain('FAC-2025-001');
      expect(html).toContain('NEXORA Corporation');
      expect(html).toContain('Acme Corp Solutions');
      expect(html).toContain('2400.00 EUR');
    });
  });

  describe('5. Offline-First Synchronization Database Integration', () => {
    it('should save quotes, invoices, payments offline and apply optimistic state updates', async () => {
      const localDb = new NexoraLocalDatabase();

      await localDb.saveSyncMutation({
        id: 'mut-quote-1',
        organizationId: tenantA.organizationId,
        entityType: 'Quote',
        entityId: 'quote-local-1',
        operation: 'INSERT',
        payload: {
          id: 'quote-local-1',
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          quoteNumber: 'TEMP-DEV-001',
          status: 'DRAFT',
          totalUntaxed: 500,
          totalTax: 100,
          totalAmount: 600,
          lineItems: [],
          createdAt: new Date().toISOString(),
        },
      });

      await localDb.saveSyncMutation({
        id: 'mut-inv-1',
        organizationId: tenantA.organizationId,
        entityType: 'Invoice',
        entityId: 'inv-local-1',
        operation: 'INSERT',
        payload: {
          id: 'inv-local-1',
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          invoiceNumber: 'TEMP-FAC-001',
          status: 'UNPAID',
          totalUntaxed: 500,
          totalTax: 100,
          totalAmount: 600,
          amountPaid: 0,
          amountDue: 600,
          lineItems: [],
          createdAt: new Date().toISOString(),
        },
      });

      await localDb.saveSyncMutation({
        id: 'mut-pay-1',
        organizationId: tenantA.organizationId,
        entityType: 'Payment',
        entityId: 'pay-local-1',
        operation: 'INSERT',
        payload: {
          id: 'pay-local-1',
          organizationId: tenantA.organizationId,
          customerId: customerAId,
          invoiceId: 'inv-local-1',
          paymentNumber: 'TEMP-PAY-001',
          amount: 600,
          paymentMethod: 'CASH',
          createdAt: new Date().toISOString(),
        },
      });

      expect(localDb.quotes).toHaveLength(1);
      expect(localDb.invoices).toHaveLength(1);
      expect(localDb.payments).toHaveLength(1);

      // Payment optimistic update on invoice
      expect(localDb.invoices[0].amountPaid).toEqual(600);
      expect(localDb.invoices[0].amountDue).toEqual(0);
      expect(localDb.invoices[0].status).toEqual('PAID');

      const pending = localDb.getPendingMutations(tenantA.organizationId);
      expect(pending).toHaveLength(3);
    });
  });
});
