import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { InvoiceDto, CreateInvoiceDto, UpdateInvoiceDto } from '@nexora/nexus';
import { SalesFinancialService } from '../sales/financial-calculator';
import { CustomersService } from '../customers/customers.service';
import { StockService } from '../stock/stock.service';
import { QuotesService } from '../quotes/quotes.service';

export class InvoicesService {
  private static invoicesStore: InvoiceDto[] = [];
  private static sequenceStore: Record<string, number> = {};

  private static getNextNumber(organizationId: string): string {
    const year = new Date().getFullYear();
    const key = `${organizationId}-${year}`;
    this.sequenceStore[key] = (this.sequenceStore[key] || 0) + 1;
    const seq = String(this.sequenceStore[key]).padStart(4, '0');
    return `FAC-${year}-${seq}`;
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): InvoiceDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:read');
    return this.invoicesStore.filter((i) => i.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, invoiceId: string, userPermissions: string[]): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:read');
    const invoice = this.invoicesStore.find(
      (i) => i.id === invoiceId && i.organizationId === tenantContext.organizationId
    );
    if (!invoice) {
      throw new Error(`INVOICE_NOT_FOUND: Invoice ${invoiceId} not found or cross-tenant access denied`);
    }
    return invoice;
  }

  public static create(tenantContext: TenantContext, dto: CreateInvoiceDto, userPermissions: string[]): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:create');

    if (dto.idempotencyKey) {
      const existing = this.invoicesStore.find(
        (i) => i.organizationId === tenantContext.organizationId && i.idempotencyKey === dto.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    CustomersService.findOne(tenantContext, dto.customerId, userPermissions);

    if (dto.quoteId) {
      QuotesService.markConverted(tenantContext, dto.quoteId, userPermissions);
    }

    const invoiceId = `fac-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const totals = SalesFinancialService.calculateTotals(dto.lineItems, { invoiceId });

    const invoice: InvoiceDto = {
      id: invoiceId,
      organizationId: tenantContext.organizationId,
      customerId: dto.customerId,
      quoteId: dto.quoteId,
      invoiceNumber: `TEMP-${Date.now()}`,
      status: 'DRAFT',
      totalUntaxed: totals.totalUntaxed,
      totalTax: totals.totalTax,
      totalAmount: totals.totalAmount,
      amountPaid: 0,
      amountDue: totals.totalAmount,
      dueDate: dto.dueDate,
      createdAt: new Date().toISOString(),
      lineItems: totals.processedLineItems,
      deliveryNoteIds: dto.deliveryNoteIds || [],
      idempotencyKey: dto.idempotencyKey,
    };

    this.invoicesStore.push(invoice);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Invoice',
      entityId: invoice.id,
    });

    return invoice;
  }

  public static update(
    tenantContext: TenantContext,
    invoiceId: string,
    dto: UpdateInvoiceDto,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:update');
    const existing = this.findOne(tenantContext, invoiceId, userPermissions);

    if (existing.status !== 'DRAFT') {
      throw new Error(`INVOICE_LOCKED: Cannot update invoice in status [${existing.status}]`);
    }

    if (dto.customerId) {
      CustomersService.findOne(tenantContext, dto.customerId, userPermissions);
      existing.customerId = dto.customerId;
    }

    if (dto.dueDate) {
      existing.dueDate = dto.dueDate;
    }

    if (dto.lineItems) {
      const totals = SalesFinancialService.calculateTotals(dto.lineItems, { invoiceId: existing.id });
      existing.totalUntaxed = totals.totalUntaxed;
      existing.totalTax = totals.totalTax;
      existing.totalAmount = totals.totalAmount;
      existing.amountDue = SalesFinancialService.round2(totals.totalAmount - existing.amountPaid);
      existing.lineItems = totals.processedLineItems;
    }

    return existing;
  }

  public static issueInvoice(
    tenantContext: TenantContext,
    invoiceId: string,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:manage');
    const existing = this.findOne(tenantContext, invoiceId, userPermissions);

    if (existing.status !== 'DRAFT') {
      throw new Error(`INVOICE_LOCKED: Invoice ${invoiceId} is already issued [status: ${existing.status}]`);
    }

    // Check if any associated delivery note already deducted stock
    let alreadyDeducted = false;
    if (existing.deliveryNoteIds && existing.deliveryNoteIds.length > 0) {
      for (const dnId of existing.deliveryNoteIds) {
        if (StockService.hasDocumentStockOut(tenantContext, 'DELIVERY_NOTE', dnId)) {
          alreadyDeducted = true;
          break;
        }
      }
    }

    if (!alreadyDeducted) {
      // Execute stock OUT for stockable product line items
      for (const line of existing.lineItems) {
        if (line.productServiceId) {
          StockService.recordOutMovement(
            tenantContext,
            {
              productId: line.productServiceId,
              quantity: line.quantity,
              referenceDocType: 'INVOICE',
              referenceDocId: existing.id,
            },
            userPermissions
          );
        }
      }
    }

    existing.invoiceNumber = this.getNextNumber(tenantContext.organizationId);
    existing.status = 'UNPAID';

    // Increase customer debt balance
    const customer = CustomersService.findOne(tenantContext, existing.customerId, userPermissions);
    CustomersService.update(
      tenantContext,
      customer.id,
      { balance: SalesFinancialService.round2(customer.balance + existing.totalAmount) },
      userPermissions
    );

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'ISSUE_INVOICE',
      entityName: 'Invoice',
      entityId: invoiceId,
      changes: { invoiceNumber: existing.invoiceNumber },
    });

    return existing;
  }

  public static cancelInvoice(
    tenantContext: TenantContext,
    invoiceId: string,
    reason: string,
    userPermissions: string[]
  ): InvoiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:manage');
    const existing = this.findOne(tenantContext, invoiceId, userPermissions);

    if (existing.status === 'CANCELLED') {
      throw new Error(`INVALID_STATUS_TRANSITION: Invoice is already CANCELLED`);
    }

    if (existing.status === 'PAID') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot directly cancel a PAID invoice without credit note`);
    }

    // Reverse customer debt balance adjustment if invoice was issued
    if (existing.status !== 'DRAFT') {
      const customer = CustomersService.findOne(tenantContext, existing.customerId, userPermissions);
      const remainingUnpaid = SalesFinancialService.round2(existing.totalAmount - existing.amountPaid);
      CustomersService.update(
        tenantContext,
        customer.id,
        { balance: Math.max(0, SalesFinancialService.round2(customer.balance - remainingUnpaid)) },
        userPermissions
      );

      // If invoice directly deducted stock, restore stock via IN movements
      const directStockDeducted = StockService.hasDocumentStockOut(tenantContext, 'INVOICE', existing.id);
      if (directStockDeducted) {
        for (const line of existing.lineItems) {
          if (line.productServiceId) {
            StockService.recordInMovement(
              tenantContext,
              {
                productId: line.productServiceId,
                quantity: line.quantity,
                referenceDocType: 'INVOICE_CANCELLATION',
                referenceDocId: existing.id,
                reason: `Stock restored upon cancellation of invoice #${existing.invoiceNumber}`,
              },
              userPermissions
            );
          }
        }
      }
    }

    existing.status = 'CANCELLED';

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CANCEL_INVOICE',
      entityName: 'Invoice',
      entityId: invoiceId,
      changes: { reason },
    });

    return existing;
  }

  public static updateSettlementAmount(
    tenantContext: TenantContext,
    invoiceId: string,
    amountPaid: number,
    status: 'UNPAID' | 'PARTIAL' | 'PAID',
    userPermissions: string[]
  ): void {
    const existing = this.findOne(tenantContext, invoiceId, userPermissions);
    existing.amountPaid = SalesFinancialService.round2(amountPaid);
    existing.amountDue = SalesFinancialService.round2(existing.totalAmount - existing.amountPaid);
    existing.status = status;
  }

  public static clearStoreForTesting(): void {
    this.invoicesStore = [];
    this.sequenceStore = {};
  }
}
