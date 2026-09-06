import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CatalogService } from '../catalog/catalog.service';

export interface StockMovementRecord {
  id: string;
  organizationId: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  unitCost: number;
  reason?: string;
  referenceDocType?: string;
  referenceDocId?: string;
  createdBy?: string;
  createdAt: string;
  idempotencyKey?: string;
}

export class StockService {
  private static movementsStore: StockMovementRecord[] = [];

  public static getMovements(tenantContext: TenantContext, userPermissions: string[]): StockMovementRecord[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:read');
    return this.movementsStore.filter((m) => m.organizationId === tenantContext.organizationId);
  }

  public static hasDocumentStockOut(
    tenantContext: TenantContext,
    docType: string,
    docId: string
  ): boolean {
    return this.movementsStore.some(
      (m) =>
        m.organizationId === tenantContext.organizationId &&
        m.type === 'OUT' &&
        m.referenceDocType === docType &&
        m.referenceDocId === docId
    );
  }

  public static recordOutMovement(
    tenantContext: TenantContext,
    params: {
      productId: string;
      quantity: number;
      unitCost?: number;
      reason?: string;
      referenceDocType?: string;
      referenceDocId?: string;
      createdBy?: string;
      idempotencyKey?: string;
    },
    userPermissions: string[]
  ): StockMovementRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:write');

    if (params.idempotencyKey) {
      const existing = this.movementsStore.find(
        (m) => m.organizationId === tenantContext.organizationId && m.idempotencyKey === params.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    const products = CatalogService.getProductsServices(tenantContext, userPermissions);
    const product = products.find((p) => p.id === params.productId);

    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product ${params.productId} not found or cross-tenant access denied`);
    }

    if (product.type !== 'PRODUCT') {
      // Service items generate zero stock movements
      return null as any;
    }

    if (product.currentStock < params.quantity) {
      throw new Error(
        `INSUFFICIENT_STOCK_ERROR: Cannot complete stock OUT. Available: ${product.currentStock}, requested: ${params.quantity}`
      );
    }

    product.currentStock -= params.quantity;

    const movement: StockMovementRecord = {
      id: `mvt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      productId: params.productId,
      type: 'OUT',
      quantity: params.quantity,
      unitCost: params.unitCost || product.purchaseCost || 0,
      reason: params.reason || `Stock OUT for ${params.referenceDocType} #${params.referenceDocId}`,
      referenceDocType: params.referenceDocType,
      referenceDocId: params.referenceDocId,
      createdBy: params.createdBy || tenantContext.userId,
      createdAt: new Date().toISOString(),
      idempotencyKey: params.idempotencyKey,
    };

    this.movementsStore.push(movement);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'STOCK_OUT',
      entityName: 'ProductService',
      entityId: params.productId,
      changes: { newStock: product.currentStock, quantityOut: params.quantity },
    });

    return movement;
  }

  public static recordInMovement(
    tenantContext: TenantContext,
    params: {
      productId: string;
      quantity: number;
      unitCost?: number;
      reason?: string;
      referenceDocType?: string;
      referenceDocId?: string;
      createdBy?: string;
      idempotencyKey?: string;
    },
    userPermissions: string[]
  ): StockMovementRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:write');

    if (params.idempotencyKey) {
      const existing = this.movementsStore.find(
        (m) => m.organizationId === tenantContext.organizationId && m.idempotencyKey === params.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    const products = CatalogService.getProductsServices(tenantContext, userPermissions);
    const product = products.find((p) => p.id === params.productId);

    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product ${params.productId} not found or cross-tenant access denied`);
    }

    if (product.type !== 'PRODUCT') {
      return null as any;
    }

    product.currentStock += params.quantity;

    const movement: StockMovementRecord = {
      id: `mvt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      productId: params.productId,
      type: 'IN',
      quantity: params.quantity,
      unitCost: params.unitCost || product.purchaseCost || 0,
      reason: params.reason || `Stock IN for ${params.referenceDocType} #${params.referenceDocId}`,
      referenceDocType: params.referenceDocType,
      referenceDocId: params.referenceDocId,
      createdBy: params.createdBy || tenantContext.userId,
      createdAt: new Date().toISOString(),
      idempotencyKey: params.idempotencyKey,
    };

    this.movementsStore.push(movement);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'STOCK_IN',
      entityName: 'ProductService',
      entityId: params.productId,
      changes: { newStock: product.currentStock, quantityIn: params.quantity },
    });

    return movement;
  }

  public static recordAdjustmentMovement(
    tenantContext: TenantContext,
    params: {
      productId: string;
      adjustmentQuantity: number;
      unitCost?: number;
      reason?: string;
      referenceDocType?: string;
      referenceDocId?: string;
      createdBy?: string;
      idempotencyKey?: string;
    },
    userPermissions: string[]
  ): StockMovementRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:write');

    if (params.idempotencyKey) {
      const existing = this.movementsStore.find(
        (m) => m.organizationId === tenantContext.organizationId && m.idempotencyKey === params.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    if (params.adjustmentQuantity === 0) {
      return null as any;
    }

    const products = CatalogService.getProductsServices(tenantContext, userPermissions);
    const product = products.find((p) => p.id === params.productId);

    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product ${params.productId} not found or cross-tenant access denied`);
    }

    if (product.type !== 'PRODUCT') {
      return null as any;
    }

    const absQuantity = Math.abs(params.adjustmentQuantity);

    if (params.adjustmentQuantity < 0 && product.currentStock < absQuantity) {
      throw new Error(
        `INSUFFICIENT_STOCK_ERROR: Cannot complete stock ADJUSTMENT. Available: ${product.currentStock}, requested reduction: ${absQuantity}`
      );
    }

    product.currentStock += params.adjustmentQuantity;

    const defaultReason =
      params.adjustmentQuantity > 0
        ? `Ajustement inventaire (Excédent +${absQuantity})`
        : `Ajustement inventaire (Manquant -${absQuantity})`;

    const movement: StockMovementRecord = {
      id: `mvt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      productId: params.productId,
      type: 'ADJUSTMENT',
      quantity: absQuantity,
      unitCost: params.unitCost || product.purchaseCost || 0,
      reason: params.reason || defaultReason,
      referenceDocType: params.referenceDocType || 'INVENTORY',
      referenceDocId: params.referenceDocId,
      createdBy: params.createdBy || tenantContext.userId,
      createdAt: new Date().toISOString(),
      idempotencyKey: params.idempotencyKey,
    };

    this.movementsStore.push(movement);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'STOCK_ADJUSTMENT',
      entityName: 'ProductService',
      entityId: params.productId,
      changes: { newStock: product.currentStock, adjustmentDelta: params.adjustmentQuantity },
    });

    return movement;
  }

  public static clearStoreForTesting(): void {
    this.movementsStore = [];
  }
}
