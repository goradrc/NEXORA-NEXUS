import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { QuoteDto, CreateQuoteDto, UpdateQuoteDto } from '@nexora/nexus';
import { SalesFinancialService } from '../sales/financial-calculator';
import { CustomersService } from '../customers/customers.service';

export class QuotesService {
  private static quotesStore: QuoteDto[] = [];
  private static sequenceStore: Record<string, number> = {};

  private static getNextNumber(organizationId: string): string {
    const year = new Date().getFullYear();
    const key = `${organizationId}-${year}`;
    this.sequenceStore[key] = (this.sequenceStore[key] || 0) + 1;
    const seq = String(this.sequenceStore[key]).padStart(4, '0');
    return `DEV-${year}-${seq}`;
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): QuoteDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:read');
    return this.quotesStore.filter((q) => q.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, quoteId: string, userPermissions: string[]): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:read');
    const quote = this.quotesStore.find(
      (q) => q.id === quoteId && q.organizationId === tenantContext.organizationId
    );
    if (!quote) {
      throw new Error(`QUOTE_NOT_FOUND: Quote ${quoteId} not found or cross-tenant access denied`);
    }
    return quote;
  }

  public static create(tenantContext: TenantContext, dto: CreateQuoteDto, userPermissions: string[]): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:create');

    if (dto.idempotencyKey) {
      const existing = this.quotesStore.find(
        (q) => q.organizationId === tenantContext.organizationId && q.idempotencyKey === dto.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    CustomersService.findOne(tenantContext, dto.customerId, userPermissions);

    const quoteId = `quote-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const totals = SalesFinancialService.calculateTotals(dto.lineItems, { quoteId });

    const quote: QuoteDto = {
      id: quoteId,
      organizationId: tenantContext.organizationId,
      customerId: dto.customerId,
      quoteNumber: this.getNextNumber(tenantContext.organizationId),
      status: 'DRAFT',
      totalUntaxed: totals.totalUntaxed,
      totalTax: totals.totalTax,
      totalAmount: totals.totalAmount,
      validUntil: dto.validUntil,
      createdAt: new Date().toISOString(),
      lineItems: totals.processedLineItems,
      idempotencyKey: dto.idempotencyKey,
    };

    this.quotesStore.push(quote);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Quote',
      entityId: quote.id,
    });

    return quote;
  }

  public static update(
    tenantContext: TenantContext,
    quoteId: string,
    dto: UpdateQuoteDto,
    userPermissions: string[]
  ): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:update');
    const existing = this.findOne(tenantContext, quoteId, userPermissions);

    if (existing.status !== 'DRAFT') {
      throw new Error(`QUOTE_LOCKED: Cannot update quote in status [${existing.status}]`);
    }

    if (dto.customerId) {
      CustomersService.findOne(tenantContext, dto.customerId, userPermissions);
      existing.customerId = dto.customerId;
    }

    if (dto.validUntil) {
      existing.validUntil = dto.validUntil;
    }

    if (dto.lineItems) {
      const totals = SalesFinancialService.calculateTotals(dto.lineItems, { quoteId: existing.id });
      existing.totalUntaxed = totals.totalUntaxed;
      existing.totalTax = totals.totalTax;
      existing.totalAmount = totals.totalAmount;
      existing.lineItems = totals.processedLineItems;
    }

    return existing;
  }

  public static send(tenantContext: TenantContext, quoteId: string, userPermissions: string[]): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:manage');
    const existing = this.findOne(tenantContext, quoteId, userPermissions);

    if (existing.status !== 'DRAFT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot send quote in status [${existing.status}]`);
    }

    existing.status = 'SENT';
    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'SEND_QUOTE',
      entityName: 'Quote',
      entityId: quoteId,
    });
    return existing;
  }

  public static accept(tenantContext: TenantContext, quoteId: string, userPermissions: string[]): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:manage');
    const existing = this.findOne(tenantContext, quoteId, userPermissions);

    if (existing.status !== 'SENT' && existing.status !== 'DRAFT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot accept quote in status [${existing.status}]`);
    }

    existing.status = 'ACCEPTED';
    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'ACCEPT_QUOTE',
      entityName: 'Quote',
      entityId: quoteId,
    });
    return existing;
  }

  public static reject(tenantContext: TenantContext, quoteId: string, userPermissions: string[]): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:manage');
    const existing = this.findOne(tenantContext, quoteId, userPermissions);

    if (existing.status === 'CONVERTED' || existing.status === 'REJECTED') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot reject quote in status [${existing.status}]`);
    }

    existing.status = 'REJECTED';
    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'REJECT_QUOTE',
      entityName: 'Quote',
      entityId: quoteId,
    });
    return existing;
  }

  public static markConverted(tenantContext: TenantContext, quoteId: string, userPermissions: string[]): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:manage');
    const existing = this.findOne(tenantContext, quoteId, userPermissions);

    if (existing.status !== 'ACCEPTED' && existing.status !== 'SENT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot convert quote in status [${existing.status}]`);
    }

    existing.status = 'CONVERTED';
    return existing;
  }

  public static clearStoreForTesting(): void {
    this.quotesStore = [];
    this.sequenceStore = {};
  }
}
