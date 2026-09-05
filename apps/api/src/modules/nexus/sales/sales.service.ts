import { TenantContext, TenantMiddleware, RolesGuard } from '@nexora/core';
import {
  QuoteDto,
  CreateQuoteDto,
  UpdateQuoteDto,
  InvoiceDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  PaymentDto,
  RecordPaymentDto,
  LineItemDto,
  CreateLineItemDto,
  QuoteStatus,
  InvoiceStatus,
} from '@nexora/nexus';

export class SalesService {
  private static documentCounters: Map<string, number> = new Map();

  private static quotesStore: QuoteDto[] = [];
  private static invoicesStore: InvoiceDto[] = [];
  private static paymentsStore: PaymentDto[] = [];

  // Helper: Get next sequential document number (e.g., FAC-2025-0001)
  private static getNextDocumentNumber(
    organizationId: string,
    prefix: 'DEV' | 'FAC' | 'PAY',
    year: number = new Date().getFullYear()
  ): string {
    const key = `${organizationId}:${prefix}:${year}`;
    const current = this.documentCounters.get(key) || 0;
    const next = current + 1;
    this.documentCounters.set(key, next);
    return `${prefix}-${year}-${next.toString().padStart(4, '0')}`;
  }

  // Helper: Calculate line item net HT price
  public static calculateLineTotal(item: CreateLineItemDto): number {
    const qty = Math.max(0, item.quantity || 0);
    const price = Math.max(0, item.unitPrice || 0);
    const discount = Math.min(100, Math.max(0, item.discountPercent || 0));
    return Number((qty * price * (1 - discount / 100)).toFixed(2));
  }

  // Helper: Process line items and compute totals
  public static processLineItems(items: CreateLineItemDto[]): {
    processedLines: LineItemDto[];
    totalUntaxed: number;
    totalTax: number;
    totalAmount: number;
  } {
    let totalUntaxed = 0;
    let totalTax = 0;

    const processedLines: LineItemDto[] = items.map((line, idx) => {
      const lineHT = this.calculateLineTotal(line);
      const taxRate = Math.max(0, line.taxRate || 0);
      const lineTax = Number((lineHT * (taxRate / 100)).toFixed(2));

      totalUntaxed += lineHT;
      totalTax += lineTax;

      return {
        id: `line-${Date.now()}-${idx}-${crypto.randomUUID().slice(0, 4)}`,
        productServiceId: line.productServiceId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate,
        discountPercent: line.discountPercent || 0,
        totalPrice: lineHT,
      };
    });

    totalUntaxed = Number(totalUntaxed.toFixed(2));
    totalTax = Number(totalTax.toFixed(2));
    const totalAmount = Number((totalUntaxed + totalTax).toFixed(2));

    return { processedLines, totalUntaxed, totalTax, totalAmount };
  }

  // ==========================================
  // QUOTES (DEVIS & PROFORMAS)
  // ==========================================

  public static findAllQuotes(tenantContext: TenantContext, userPermissions: string[]): QuoteDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:read');
    return this.quotesStore.filter((q) => q.organizationId === tenantContext.organizationId);
  }

  public static findOneQuote(
    tenantContext: TenantContext,
    quoteId: string,
    userPermissions: string[]
  ): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:read');
    const quote = this.quotesStore.find(
      (q) => q.id === quoteId && q.organizationId === tenantContext.organizationId
    );
    if (!quote) {
      throw new Error(`QUOTE_NOT_FOUND: Quote ${quoteId} not found or cross-tenant access denied`);
    }
    return quote;
  }

  public static createQuote(
    tenantContext: TenantContext,
    dto: CreateQuoteDto,
    userPermissions: string[]
  ): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:create');
    const orgId = tenantContext.organizationId;

    const { processedLines, totalUntaxed, totalTax, totalAmount } = this.processLineItems(
      dto.lineItems || []
    );

    const officialNumber =
      dto.quoteNumber && !dto.quoteNumber.startsWith('TEMP-')
        ? dto.quoteNumber
        : this.getNextDocumentNumber(orgId, 'DEV');

    const newQuote: QuoteDto = {
      id: `q-${crypto.randomUUID()}`,
      organizationId: orgId,
      customerId: dto.customerId,
      quoteNumber: officialNumber,
      status: 'DRAFT',
      totalUntaxed,
      totalTax,
      totalAmount,
      validUntil: dto.validUntil || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      lineItems: processedLines,
    };

    this.quotesStore.push(newQuote);
    return newQuote;
  }

  public static updateQuote(
    tenantContext: TenantContext,
    quoteId: string,
    dto: UpdateQuoteDto,
    userPermissions: string[]
  ): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:update');
    const existing = this.findOneQuote(tenantContext, quoteId, userPermissions);

    if (existing.status === 'CONVERTED' || existing.status === 'REJECTED') {
      throw new Error(`QUOTE_LOCKED: Cannot update a quote that is ${existing.status}`);
    }

    let { processedLines, totalUntaxed, totalTax, totalAmount } = {
      processedLines: existing.lineItems,
      totalUntaxed: existing.totalUntaxed,
      totalTax: existing.totalTax,
      totalAmount: existing.totalAmount,
    };

    if (dto.lineItems) {
      const processed = this.processLineItems(dto.lineItems);
      processedLines = processed.processedLines;
      totalUntaxed = processed.totalUntaxed;
      totalTax = processed.totalTax;
      totalAmount = processed.totalAmount;
    }

    const updated: QuoteDto = {
      ...existing,
      customerId: dto.customerId || existing.customerId,
      status: dto.status || existing.status,
      validUntil: dto.validUntil || existing.validUntil,
      totalUntaxed,
      totalTax,
      totalAmount,
      lineItems: processedLines,
    };

    const idx = this.quotesStore.findIndex(
      (q) => q.id === quoteId && q.organizationId === tenantContext.organizationId
    );
    this.quotesStore[idx] = updated;
    return updated;
  }

  public static convertQuoteToInvoice(
    tenantContext: TenantContext,
    quoteId: string,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:update');
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:create');

    const quote = this.findOneQuote(tenantContext, quoteId, userPermissions);

    if (quote.status === 'CONVERTED') {
      throw new Error(`QUOTE_ALREADY_CONVERTED: Quote ${quoteId} is already converted`);
    }

    // Mark quote as ACCEPTED and CONVERTED
    quote.status = 'CONVERTED';

    // Create Invoice from Quote snapshot
    const createInvoiceDto: CreateInvoiceDto = {
      customerId: quote.customerId,
      quoteId: quote.id,
      lineItems: quote.lineItems.map((l) => ({
        productServiceId: l.productServiceId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        discountPercent: l.discountPercent,
      })),
    };

    return this.createInvoice(tenantContext, createInvoiceDto, userPermissions);
  }

  public static deleteQuote(
    tenantContext: TenantContext,
    quoteId: string,
    userPermissions: string[]
  ): boolean {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:delete');
    const existing = this.findOneQuote(tenantContext, quoteId, userPermissions);

    if (existing.status === 'CONVERTED') {
      throw new Error('QUOTE_LOCKED: Cannot delete converted quote');
    }

    this.quotesStore = this.quotesStore.filter(
      (q) => !(q.id === quoteId && q.organizationId === tenantContext.organizationId)
    );
    return true;
  }

  // ==========================================
  // INVOICES (FACTURES DE VENTE)
  // ==========================================

  public static findAllInvoices(tenantContext: TenantContext, userPermissions: string[]): InvoiceDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:read');
    return this.invoicesStore.filter((i) => i.organizationId === tenantContext.organizationId);
  }

  public static findOneInvoice(
    tenantContext: TenantContext,
    invoiceId: string,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:read');
    const invoice = this.invoicesStore.find(
      (i) => i.id === invoiceId && i.organizationId === tenantContext.organizationId
    );
    if (!invoice) {
      throw new Error(`INVOICE_NOT_FOUND: Invoice ${invoiceId} not found or cross-tenant access denied`);
    }
    return invoice;
  }

  public static createInvoice(
    tenantContext: TenantContext,
    dto: CreateInvoiceDto,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:create');
    const orgId = tenantContext.organizationId;

    const { processedLines, totalUntaxed, totalTax, totalAmount } = this.processLineItems(
      dto.lineItems || []
    );

    const officialNumber =
      dto.invoiceNumber && !dto.invoiceNumber.startsWith('TEMP-')
        ? dto.invoiceNumber
        : this.getNextDocumentNumber(orgId, 'FAC');

    const newInvoice: InvoiceDto = {
      id: `inv-${crypto.randomUUID()}`,
      organizationId: orgId,
      customerId: dto.customerId,
      quoteId: dto.quoteId,
      invoiceNumber: officialNumber,
      status: 'UNPAID', // Direct emission
      totalUntaxed,
      totalTax,
      totalAmount,
      amountPaid: 0,
      amountDue: totalAmount,
      dueDate: dto.dueDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      lineItems: processedLines,
    };

    this.invoicesStore.push(newInvoice);
    return newInvoice;
  }

  public static updateInvoice(
    tenantContext: TenantContext,
    invoiceId: string,
    dto: UpdateInvoiceDto,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:update');
    const existing = this.findOneInvoice(tenantContext, invoiceId, userPermissions);

    // Anti-fraud: Non-DRAFT issued invoices are IMMUTABLE in commercial content
    if (existing.status !== 'DRAFT' && dto.lineItems) {
      throw new Error('INVOICE_LOCKED: Issued non-draft invoice line items are immutable');
    }

    let { processedLines, totalUntaxed, totalTax, totalAmount } = {
      processedLines: existing.lineItems,
      totalUntaxed: existing.totalUntaxed,
      totalTax: existing.totalTax,
      totalAmount: existing.totalAmount,
    };

    if (existing.status === 'DRAFT' && dto.lineItems) {
      const processed = this.processLineItems(dto.lineItems);
      processedLines = processed.processedLines;
      totalUntaxed = processed.totalUntaxed;
      totalTax = processed.totalTax;
      totalAmount = processed.totalAmount;
    }

    const updated: InvoiceDto = {
      ...existing,
      customerId: existing.status === 'DRAFT' ? dto.customerId || existing.customerId : existing.customerId,
      status: dto.status || existing.status,
      dueDate: dto.dueDate || existing.dueDate,
      totalUntaxed,
      totalTax,
      totalAmount,
      amountDue: Number((totalAmount - existing.amountPaid).toFixed(2)),
      lineItems: processedLines,
    };

    const idx = this.invoicesStore.findIndex(
      (i) => i.id === invoiceId && i.organizationId === tenantContext.organizationId
    );
    this.invoicesStore[idx] = updated;
    return updated;
  }

  public static deleteInvoice(
    tenantContext: TenantContext,
    invoiceId: string,
    userPermissions: string[]
  ): boolean {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:delete');
    const existing = this.findOneInvoice(tenantContext, invoiceId, userPermissions);

    // Anti-fraud rule: Cannot physically delete an issued invoice (must be CANCELLED instead)
    if (existing.status !== 'DRAFT') {
      throw new Error('INVOICE_LOCKED_DELETE: Cannot delete an issued invoice. Cancel it instead.');
    }

    this.invoicesStore = this.invoicesStore.filter(
      (i) => !(i.id === invoiceId && i.organizationId === tenantContext.organizationId)
    );
    return true;
  }

  // ==========================================
  // PAYMENTS (ENCAISSEMENTS)
  // ==========================================

  public static findAllPayments(tenantContext: TenantContext, userPermissions: string[]): PaymentDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:read');
    return this.paymentsStore.filter((p) => p.organizationId === tenantContext.organizationId);
  }

  public static recordPayment(
    tenantContext: TenantContext,
    dto: RecordPaymentDto,
    userPermissions: string[]
  ): PaymentDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:create');
    const orgId = tenantContext.organizationId;

    const invoice = this.findOneInvoice(tenantContext, dto.invoiceId, userPermissions);

    const paymentAmount = Number(dto.amount.toFixed(2));

    // Anti-overpayment rule: Strictly reject payment exceeding invoice balance due
    if (paymentAmount <= 0) {
      throw new Error('INVALID_PAYMENT_AMOUNT: Payment amount must be positive');
    }

    if (paymentAmount > invoice.amountDue + 0.001) {
      throw new Error(
        `OVERPAYMENT_REJECTED: Payment amount (${paymentAmount}) exceeds invoice balance due (${invoice.amountDue})`
      );
    }

    // Atomic update of Invoice payment balances
    const newAmountPaid = Number((invoice.amountPaid + paymentAmount).toFixed(2));
    const newAmountDue = Number((invoice.totalAmount - newAmountPaid).toFixed(2));

    invoice.amountPaid = newAmountPaid;
    invoice.amountDue = Math.max(0, newAmountDue);

    if (invoice.amountDue <= 0.001) {
      invoice.status = 'PAID';
      invoice.amountDue = 0;
    } else {
      invoice.status = 'PARTIAL';
    }

    const officialPaymentNumber = this.getNextDocumentNumber(orgId, 'PAY');

    const newPayment: PaymentDto = {
      id: `pay-${crypto.randomUUID()}`,
      organizationId: orgId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      paymentNumber: officialPaymentNumber,
      amount: paymentAmount,
      paymentMethod: dto.paymentMethod,
      referenceCode: dto.referenceCode,
      paymentDate: dto.paymentDate || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.paymentsStore.push(newPayment);
    return newPayment;
  }

  // Helper for testing resets
  public static clearAllForTesting(): void {
    this.documentCounters.clear();
    this.quotesStore = [];
    this.invoicesStore = [];
    this.paymentsStore = [];
  }
}
