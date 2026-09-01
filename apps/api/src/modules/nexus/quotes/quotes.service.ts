import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CreateQuoteDto, QuoteDto, QuoteStatus, LineItemDto } from '@nexora/nexus';

export class QuotesService {
  private static quotesStore: QuoteDto[] = [];

  public static getQuotes(
    tenantContext: TenantContext,
    userPermissions: string[],
    customerId?: string
  ): QuoteDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:read');
    return this.quotesStore.filter(
      q => q.organizationId === tenantContext.organizationId && (!customerId || q.customerId === customerId)
    );
  }

  public static getQuoteById(
    tenantContext: TenantContext,
    quoteId: string,
    userPermissions: string[]
  ): QuoteDto | undefined {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:read');
    return this.quotesStore.find(
      q => q.id === quoteId && q.organizationId === tenantContext.organizationId
    );
  }

  public static createQuote(
    tenantContext: TenantContext,
    dto: CreateQuoteDto,
    userPermissions: string[]
  ): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:create');

    if (!dto.lineItems || dto.lineItems.length === 0) {
      throw new Error('EMPTY_QUOTE: A quote must contain at least one line item');
    }

    const orgId = tenantContext.organizationId;
    let totalUntaxed = 0;
    let totalTax = 0;

    const lineItems: LineItemDto[] = dto.lineItems.map((item, index) => {
      const discount = item.discountPercent || 0;
      const taxRate = item.taxRate || 0;
      const untaxedUnit = item.unitPrice * (1 - discount / 100);
      const untaxedLine = untaxedUnit * item.quantity;
      const taxLine = untaxedLine * (taxRate / 100);
      const totalPrice = untaxedLine + taxLine;

      totalUntaxed += untaxedLine;
      totalTax += taxLine;

      return {
        id: `line-${Date.now()}-${index}`,
        productServiceId: item.productServiceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate,
        discountPercent: discount,
        totalPrice,
      };
    });

    const count = this.quotesStore.filter(q => q.organizationId === orgId).length + 1;
    const autoNumber = dto.quoteNumber || `DEV-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;

    const newQuote: QuoteDto = {
      id: `quote-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: orgId,
      customerId: dto.customerId,
      quoteNumber: autoNumber,
      status: QuoteStatus.DRAFT,
      totalUntaxed: Math.round(totalUntaxed * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round((totalUntaxed + totalTax) * 100) / 100,
      validUntil: dto.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: new Date(),
      lineItems,
    };

    this.quotesStore.push(newQuote);

    AuditService.log({
      organizationId: orgId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Quote',
      entityId: newQuote.id,
      changes: {
        quoteNumber: newQuote.quoteNumber,
        totalAmount: newQuote.totalAmount,
      },
    });

    return newQuote;
  }

  public static updateQuoteStatus(
    tenantContext: TenantContext,
    quoteId: string,
    status: QuoteStatus,
    userPermissions: string[]
  ): QuoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:quotes:update');
    const quote = this.quotesStore.find(
      q => q.id === quoteId && q.organizationId === tenantContext.organizationId
    );

    if (!quote) {
      throw new Error('QUOTE_NOT_FOUND: Quote does not exist for this tenant');
    }

    quote.status = status;

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'UPDATE',
      entityName: 'Quote',
      entityId: quote.id,
      changes: { status },
    });

    return quote;
  }

  public static clearStoreForTesting(): void {
    this.quotesStore = [];
  }
}
