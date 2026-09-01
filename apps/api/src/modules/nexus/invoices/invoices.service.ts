import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CreateInvoiceDto, InvoiceDto, InvoiceStatus, LineItemDto, QuoteStatus, MovementType } from '@nexora/nexus';
import { CatalogService } from '../catalog/catalog.service';
import { StockService } from '../stock/stock.service';
import { QuotesService } from '../quotes/quotes.service';

export class InvoicesService {
  private static invoicesStore: InvoiceDto[] = [];

  public static getInvoices(
    tenantContext: TenantContext,
    userPermissions: string[],
    customerId?: string
  ): InvoiceDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:read');
    return this.invoicesStore.filter(
      inv => inv.organizationId === tenantContext.organizationId && (!customerId || inv.customerId === customerId)
    );
  }

  public static getInvoiceById(
    tenantContext: TenantContext,
    invoiceId: string,
    userPermissions: string[]
  ): InvoiceDto | undefined {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:read');
    return this.invoicesStore.find(
      inv => inv.id === invoiceId && inv.organizationId === tenantContext.organizationId
    );
  }

  public static createInvoice(
    tenantContext: TenantContext,
    dto: CreateInvoiceDto,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:create');

    if (!dto.lineItems || dto.lineItems.length === 0) {
      throw new Error('EMPTY_INVOICE: An invoice must contain at least one line item');
    }

    const orgId = tenantContext.organizationId;
    let totalUntaxed = 0;
    let totalTax = 0;

    const catalog = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);

    const lineItems: LineItemDto[] = dto.lineItems.map((item, index) => {
      const discount = item.discountPercent || 0;
      const taxRate = item.taxRate || 0;
      const untaxedUnit = item.unitPrice * (1 - discount / 100);
      const untaxedLine = untaxedUnit * item.quantity;
      const taxLine = untaxedLine * (taxRate / 100);
      const totalPrice = untaxedLine + taxLine;

      totalUntaxed += untaxedLine;
      totalTax += taxLine;

      // Automatically deduct physical product stock
      const product = catalog.find(p => p.id === item.productServiceId);
      if (product && product.type === 'PRODUCT') {
        StockService.createMovement(
          tenantContext,
          {
            organizationId: orgId,
            productId: product.id,
            type: MovementType.OUT,
            quantity: item.quantity,
            unitCost: product.purchaseCost,
            reason: `Invoice sale deduction`,
          },
          ['nexus:stock:create', 'nexus:catalog:read']
        );
      }

      return {
        id: `line-${Date.now()}-${index}`,
        productServiceId: item.productServiceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate,
        discountPercent: discount,
        totalPrice: Math.round(totalPrice * 100) / 100,
      };
    });

    const count = this.invoicesStore.filter(i => i.organizationId === orgId).length + 1;
    const autoNumber = dto.invoiceNumber || `FAC-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;
    const roundedUntaxed = Math.round(totalUntaxed * 100) / 100;
    const roundedTax = Math.round(totalTax * 100) / 100;
    const roundedTotal = Math.round((roundedUntaxed + roundedTax) * 100) / 100;

    const newInvoice: InvoiceDto = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: orgId,
      customerId: dto.customerId,
      quoteId: dto.quoteId,
      invoiceNumber: autoNumber,
      status: InvoiceStatus.UNPAID,
      totalUntaxed: roundedUntaxed,
      totalTax: roundedTax,
      totalAmount: roundedTotal,
      amountPaid: 0,
      amountDue: roundedTotal,
      dueDate: dto.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: new Date(),
      lineItems,
    };

    this.invoicesStore.push(newInvoice);

    AuditService.log({
      organizationId: orgId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Invoice',
      entityId: newInvoice.id,
      changes: {
        invoiceNumber: newInvoice.invoiceNumber,
        totalAmount: newInvoice.totalAmount,
      },
    });

    return newInvoice;
  }

  public static createInvoiceFromQuote(
    tenantContext: TenantContext,
    quoteId: string,
    userPermissions: string[]
  ): InvoiceDto {
    const quote = QuotesService.getQuoteById(tenantContext, quoteId, userPermissions);
    if (!quote) {
      throw new Error('QUOTE_NOT_FOUND: Quote does not exist for this tenant');
    }

    const invoice = this.createInvoice(
      tenantContext,
      {
        organizationId: tenantContext.organizationId,
        customerId: quote.customerId,
        quoteId: quote.id,
        lineItems: quote.lineItems.map(item => ({
          productServiceId: item.productServiceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          discountPercent: item.discountPercent,
        })),
      },
      userPermissions
    );

    QuotesService.updateQuoteStatus(tenantContext, quote.id, QuoteStatus.CONVERTED, userPermissions);

    return invoice;
  }

  public static updateInvoicePaymentState(
    tenantContext: TenantContext,
    invoiceId: string,
    amountPaidDelta: number
  ): InvoiceDto {
    const invoice = this.invoicesStore.find(
      i => i.id === invoiceId && i.organizationId === tenantContext.organizationId
    );

    if (!invoice) {
      throw new Error('INVOICE_NOT_FOUND: Invoice does not exist for this tenant');
    }

    invoice.amountPaid = Math.round((invoice.amountPaid + amountPaidDelta) * 100) / 100;
    invoice.amountDue = Math.round((invoice.totalAmount - invoice.amountPaid) * 100) / 100;

    if (invoice.amountDue <= 0) {
      invoice.amountDue = 0;
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.amountPaid > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    } else {
      invoice.status = InvoiceStatus.UNPAID;
    }

    return invoice;
  }

  public static clearStoreForTesting(): void {
    this.invoicesStore = [];
  }
}
