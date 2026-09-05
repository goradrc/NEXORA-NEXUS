import { TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';
import {
  PurchaseOrderDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderLineItemDto,
  POStatus,
} from '@nexora/nexus';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CatalogService } from '../catalog/catalog.service';

export interface RecordedStockMovement {
  id: string;
  organizationId: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  unitCost: number;
  reason: string;
  referenceDocType: string;
  referenceDocId: string;
  createdAt: string;
}

export class PurchaseOrdersService {
  private static purchaseOrdersStore: PurchaseOrderDto[] = [];
  private static stockMovementsStore: RecordedStockMovement[] = [];

  public static getStockMovements(tenantContext: TenantContext): RecordedStockMovement[] {
    return this.stockMovementsStore.filter((m) => m.organizationId === tenantContext.organizationId);
  }

  public static clearStoreForTesting(): void {
    this.purchaseOrdersStore = [];
    this.stockMovementsStore = [];
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): PurchaseOrderDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:read');
    return this.purchaseOrdersStore.filter((po) => po.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:read');
    const po = this.purchaseOrdersStore.find(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );
    if (!po) {
      throw new Error(`PURCHASE_ORDER_NOT_FOUND: Purchase order ${id} not found or cross-tenant access denied`);
    }
    return po;
  }

  public static create(
    tenantContext: TenantContext,
    dto: CreatePurchaseOrderDto,
    userPermissions: string[]
  ): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:create');

    // 1. Verify supplier existence in tenant
    SuppliersService.findOne(tenantContext, dto.supplierId, ['nexus:suppliers:read']);

    // 2. Validate line items
    if (!dto.lineItems || dto.lineItems.length === 0) {
      throw new Error('INVALID_PURCHASE_ORDER: At least one line item is required');
    }

    const processedLines: PurchaseOrderLineItemDto[] = [];
    let totalUntaxed = 0;
    let totalTax = 0;

    const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);

    for (const line of dto.lineItems) {
      if (line.quantity <= 0) {
        throw new Error(`INVALID_LINE_ITEM_QUANTITY: Line item quantity must be greater than 0 (got ${line.quantity})`);
      }
      if (line.unitPrice < 0) {
        throw new Error(`INVALID_LINE_ITEM_PRICE: Line item unit price cannot be negative (got ${line.unitPrice})`);
      }

      const product = products.find((p) => p.id === line.productServiceId);
      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND: Product ${line.productServiceId} not found in catalog`);
      }

      const lineUntaxed = line.quantity * line.unitPrice;
      const taxRate = line.taxRate ?? product.taxRate ?? 0;
      const lineTax = lineUntaxed * (taxRate / 100);
      const lineTotal = lineUntaxed + lineTax;

      totalUntaxed += lineUntaxed;
      totalTax += lineTax;

      processedLines.push({
        id: `line-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productServiceId: line.productServiceId,
        description: line.description || product.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate,
        totalPrice: Number(lineTotal.toFixed(2)),
      });
    }

    const orgOrders = this.purchaseOrdersStore.filter((p) => p.organizationId === tenantContext.organizationId);
    const nextNumber = orgOrders.length + 1;
    const formattedPoNumber = dto.poNumber || `CMD-ACH-${String(nextNumber).padStart(3, '0')}`;

    const newPO: PurchaseOrderDto = {
      id: `po-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      supplierId: dto.supplierId,
      poNumber: formattedPoNumber,
      status: 'DRAFT',
      totalUntaxed: Number(totalUntaxed.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      totalAmount: Number((totalUntaxed + totalTax).toFixed(2)),
      orderDate: new Date().toISOString(),
      expectedDate: dto.expectedDate,
      notes: dto.notes,
      lineItems: processedLines,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.purchaseOrdersStore.push(newPO);
    return newPO;
  }

  public static update(
    tenantContext: TenantContext,
    id: string,
    dto: UpdatePurchaseOrderDto,
    userPermissions: string[]
  ): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:update');
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
      throw new Error(`CANNOT_MODIFY_LOCKED_PO: Cannot modify purchase order in ${po.status} status`);
    }

    const index = this.purchaseOrdersStore.findIndex(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );

    let updatedSupplierId = po.supplierId;
    if (dto.supplierId && dto.supplierId !== po.supplierId) {
      SuppliersService.findOne(tenantContext, dto.supplierId, ['nexus:suppliers:read']);
      updatedSupplierId = dto.supplierId;
    }

    let processedLines = po.lineItems;
    let totalUntaxed = po.totalUntaxed;
    let totalTax = po.totalTax;

    if (dto.lineItems && dto.lineItems.length > 0) {
      processedLines = [];
      totalUntaxed = 0;
      totalTax = 0;
      const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);

      for (const line of dto.lineItems) {
        if (line.quantity <= 0) {
          throw new Error(`INVALID_LINE_ITEM_QUANTITY: Line item quantity must be greater than 0 (got ${line.quantity})`);
        }

        const product = products.find((p) => p.id === line.productServiceId);
        if (!product) {
          throw new Error(`PRODUCT_NOT_FOUND: Product ${line.productServiceId} not found in catalog`);
        }

        const lineUntaxed = line.quantity * line.unitPrice;
        const taxRate = line.taxRate ?? product.taxRate ?? 0;
        const lineTax = lineUntaxed * (taxRate / 100);
        const lineTotal = lineUntaxed + lineTax;

        totalUntaxed += lineUntaxed;
        totalTax += lineTax;

        processedLines.push({
          id: `line-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productServiceId: line.productServiceId,
          description: line.description || product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate,
          totalPrice: Number(lineTotal.toFixed(2)),
        });
      }
    }

    const updatedPO: PurchaseOrderDto = {
      ...po,
      supplierId: updatedSupplierId,
      expectedDate: dto.expectedDate !== undefined ? dto.expectedDate : po.expectedDate,
      notes: dto.notes !== undefined ? dto.notes : po.notes,
      lineItems: processedLines,
      totalUntaxed: Number(totalUntaxed.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      totalAmount: Number((totalUntaxed + totalTax).toFixed(2)),
      updatedAt: new Date().toISOString(),
    };

    this.purchaseOrdersStore[index] = updatedPO;
    return updatedPO;
  }

  public static markOrdered(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:update');
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status !== 'DRAFT') {
      throw new Error(`INVALID_PO_STATUS_TRANSITION: Cannot transition PO from ${po.status} to ORDERED`);
    }

    const index = this.purchaseOrdersStore.findIndex(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );

    const updatedPO: PurchaseOrderDto = {
      ...po,
      status: 'ORDERED',
      updatedAt: new Date().toISOString(),
    };

    this.purchaseOrdersStore[index] = updatedPO;
    return updatedPO;
  }

  public static receive(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:update');
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status === 'RECEIVED') {
      throw new Error(`PO_ALREADY_RECEIVED: Purchase order ${id} has already been received`);
    }

    if (po.status === 'CANCELLED') {
      throw new Error('INVALID_PO_STATUS_TRANSITION: Cannot receive a CANCELLED purchase order');
    }

    const index = this.purchaseOrdersStore.findIndex(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );

    // Perform stock movements IN for products
    const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);

    for (const item of po.lineItems) {
      const product = products.find((p) => p.id === item.productServiceId);
      if (product && product.type === 'PRODUCT') {
        // Increase stock
        product.currentStock += item.quantity;

        // Record stock movement IN
        const movement: RecordedStockMovement = {
          id: `mvt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          organizationId: tenantContext.organizationId,
          productId: product.id,
          type: 'IN',
          quantity: item.quantity,
          unitCost: item.unitPrice,
          reason: `Reception Commande Fournisseur ${po.poNumber}`,
          referenceDocType: 'PURCHASE_ORDER',
          referenceDocId: po.id,
          createdAt: new Date().toISOString(),
        };
        this.stockMovementsStore.push(movement);
      }
    }

    const updatedPO: PurchaseOrderDto = {
      ...po,
      status: 'RECEIVED',
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.purchaseOrdersStore[index] = updatedPO;
    return updatedPO;
  }

  public static cancel(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:delete');
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status === 'RECEIVED') {
      throw new Error('INVALID_PO_STATUS_TRANSITION: Cannot cancel a RECEIVED purchase order');
    }

    if (po.status === 'CANCELLED') {
      return po;
    }

    const index = this.purchaseOrdersStore.findIndex(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );

    const updatedPO: PurchaseOrderDto = {
      ...po,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.purchaseOrdersStore[index] = updatedPO;
    return updatedPO;
  }
}
