import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { DeliveryNoteDto, CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from '@nexora/nexus';
import { SalesFinancialService } from '../sales/financial-calculator';
import { CustomersService } from '../customers/customers.service';
import { StockService } from '../stock/stock.service';
import { QuotesService } from '../quotes/quotes.service';

export class DeliveryNotesService {
  private static deliveryNotesStore: DeliveryNoteDto[] = [];
  private static sequenceStore: Record<string, number> = {};

  private static getNextNumber(organizationId: string): string {
    const year = new Date().getFullYear();
    const key = `${organizationId}-${year}`;
    this.sequenceStore[key] = (this.sequenceStore[key] || 0) + 1;
    const seq = String(this.sequenceStore[key]).padStart(4, '0');
    return `BL-${year}-${seq}`;
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): DeliveryNoteDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:read');
    return this.deliveryNotesStore.filter((d) => d.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, deliveryNoteId: string, userPermissions: string[]): DeliveryNoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:read');
    const note = this.deliveryNotesStore.find(
      (d) => d.id === deliveryNoteId && d.organizationId === tenantContext.organizationId
    );
    if (!note) {
      throw new Error(`DELIVERY_NOTE_NOT_FOUND: Delivery Note ${deliveryNoteId} not found or cross-tenant access denied`);
    }
    return note;
  }

  public static create(
    tenantContext: TenantContext,
    dto: CreateDeliveryNoteDto,
    userPermissions: string[]
  ): DeliveryNoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:create');

    if (dto.idempotencyKey) {
      const existing = this.deliveryNotesStore.find(
        (d) => d.organizationId === tenantContext.organizationId && d.idempotencyKey === dto.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    CustomersService.findOne(tenantContext, dto.customerId, userPermissions);

    if (dto.quoteId) {
      QuotesService.markConverted(tenantContext, dto.quoteId, userPermissions);
    }

    const deliveryNoteId = `bl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const totals = SalesFinancialService.calculateTotals(dto.lineItems, { deliveryNoteId });

    const note: DeliveryNoteDto = {
      id: deliveryNoteId,
      organizationId: tenantContext.organizationId,
      customerId: dto.customerId,
      invoiceId: dto.invoiceId,
      deliveryNumber: this.getNextNumber(tenantContext.organizationId),
      status: 'DRAFT',
      shippingAddress: dto.shippingAddress,
      carrierName: dto.carrierName,
      trackingNumber: dto.trackingNumber,
      notes: dto.notes,
      createdAt: new Date().toISOString(),
      lineItems: totals.processedLineItems,
      idempotencyKey: dto.idempotencyKey,
    };

    this.deliveryNotesStore.push(note);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'DeliveryNote',
      entityId: note.id,
    });

    return note;
  }

  public static update(
    tenantContext: TenantContext,
    deliveryNoteId: string,
    dto: UpdateDeliveryNoteDto,
    userPermissions: string[]
  ): DeliveryNoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:update');
    const existing = this.findOne(tenantContext, deliveryNoteId, userPermissions);

    if (existing.status !== 'DRAFT') {
      throw new Error(`DELIVERY_NOTE_LOCKED: Cannot update delivery note in status [${existing.status}]`);
    }

    if (dto.shippingAddress !== undefined) existing.shippingAddress = dto.shippingAddress;
    if (dto.carrierName !== undefined) existing.carrierName = dto.carrierName;
    if (dto.trackingNumber !== undefined) existing.trackingNumber = dto.trackingNumber;
    if (dto.notes !== undefined) existing.notes = dto.notes;

    if (dto.lineItems) {
      const totals = SalesFinancialService.calculateTotals(dto.lineItems, { deliveryNoteId: existing.id });
      existing.lineItems = totals.processedLineItems;
    }

    return existing;
  }

  public static markShipped(
    tenantContext: TenantContext,
    deliveryNoteId: string,
    userPermissions: string[]
  ): DeliveryNoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:manage');
    const existing = this.findOne(tenantContext, deliveryNoteId, userPermissions);

    if (existing.status !== 'DRAFT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot ship delivery note in status [${existing.status}]`);
    }

    existing.status = 'SHIPPED';
    existing.shippedAt = new Date().toISOString();

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'SHIP_DELIVERY_NOTE',
      entityName: 'DeliveryNote',
      entityId: deliveryNoteId,
    });

    return existing;
  }

  public static markDelivered(
    tenantContext: TenantContext,
    deliveryNoteId: string,
    userPermissions: string[]
  ): DeliveryNoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:manage');
    const existing = this.findOne(tenantContext, deliveryNoteId, userPermissions);

    if (existing.status === 'DELIVERED') {
      throw new Error(`INVALID_STATUS_TRANSITION: Delivery Note is already DELIVERED`);
    }

    if (existing.status === 'CANCELLED') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot deliver cancelled Delivery Note`);
    }

    // Check if stock OUT was already executed by an associated issued Invoice
    const invoiceStockDeducted = existing.invoiceId
      ? StockService.hasDocumentStockOut(tenantContext, 'INVOICE', existing.invoiceId)
      : false;

    const blStockDeducted = StockService.hasDocumentStockOut(tenantContext, 'DELIVERY_NOTE', existing.id);

    if (!invoiceStockDeducted && !blStockDeducted) {
      // Execute stock OUT for all stockable product line items
      for (const line of existing.lineItems) {
        if (line.productServiceId) {
          StockService.recordOutMovement(
            tenantContext,
            {
              productId: line.productServiceId,
              quantity: line.quantity,
              referenceDocType: 'DELIVERY_NOTE',
              referenceDocId: existing.id,
            },
            userPermissions
          );
        }
      }
    }

    existing.status = 'DELIVERED';
    existing.deliveredAt = new Date().toISOString();

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'DELIVER_DELIVERY_NOTE',
      entityName: 'DeliveryNote',
      entityId: deliveryNoteId,
    });

    return existing;
  }

  public static cancel(
    tenantContext: TenantContext,
    deliveryNoteId: string,
    userPermissions: string[]
  ): DeliveryNoteDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:delivery-notes:manage');
    const existing = this.findOne(tenantContext, deliveryNoteId, userPermissions);

    if (existing.status === 'CANCELLED') {
      throw new Error(`INVALID_STATUS_TRANSITION: Delivery Note is already CANCELLED`);
    }

    existing.status = 'CANCELLED';

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CANCEL_DELIVERY_NOTE',
      entityName: 'DeliveryNote',
      entityId: deliveryNoteId,
    });

    return existing;
  }

  public static clearStoreForTesting(): void {
    this.deliveryNotesStore = [];
    this.sequenceStore = {};
  }
}
