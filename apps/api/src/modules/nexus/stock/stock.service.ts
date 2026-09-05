import { TenantContext, RolesGuard } from '@nexora/core';
import {
  StockMovementDto,
  CreateStockMovementDto,
  StockAdjustmentDto,
  ProductStockStatusDto,
  StockLevelStatus,
} from '@nexora/nexus';
import { CatalogService } from '../catalog/catalog.service';

export class StockService {
  private static movementsStore: StockMovementDto[] = [];
  private static processedMutations: Map<string, any> = new Map();
  private static locks: Set<string> = new Set();

  private static acquireLock(key: string): void {
    if (this.locks.has(key)) {
      throw new Error(`CONCURRENCY_LOCK: Operation on ${key} is currently locked by another concurrent transaction.`);
    }
    this.locks.add(key);
  }

  private static releaseLock(key: string): void {
    this.locks.delete(key);
  }

  public static getMovements(
    tenantContext: TenantContext,
    userPermissions: string[]
  ): StockMovementDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:read');
    return this.movementsStore.filter((m) => m.organizationId === tenantContext.organizationId);
  }

  public static getProductsStockStatus(
    tenantContext: TenantContext,
    userPermissions: string[]
  ): ProductStockStatusDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:read');
    const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);

    return products.map((p) => {
      let status: StockLevelStatus = 'NORMAL';
      if (p.type === 'PRODUCT') {
        if (p.currentStock <= 0) {
          status = 'OUT_OF_STOCK';
        } else if (p.currentStock <= p.minStockAlert) {
          status = 'LOW_STOCK';
        }
      }

      return {
        productId: p.id,
        productName: p.name,
        reference: p.reference,
        type: p.type as 'PRODUCT' | 'SERVICE',
        currentStock: p.currentStock || 0,
        minStockAlert: p.minStockAlert || 0,
        status,
        unit: p.unit || 'PCE',
      };
    });
  }

  public static recordMovement(
    tenantContext: TenantContext,
    dto: CreateStockMovementDto,
    userPermissions: string[]
  ): StockMovementDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:write');
    const orgId = tenantContext.organizationId;

    if (dto.mutationId && this.processedMutations.has(dto.mutationId)) {
      return this.processedMutations.get(dto.mutationId);
    }

    const lockKey = `stock-product:${orgId}:${dto.productId}`;
    this.acquireLock(lockKey);

    try {
      const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);
      const product = products.find((p) => p.id === dto.productId && p.organizationId === orgId);

      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND: Product ${dto.productId} not found or cross-tenant access denied`);
      }

      if (product.type === 'SERVICE') {
        throw new Error('NON_STOCKABLE_ITEM: Cannot record stock movements for SERVICE items');
      }

      const qty = Math.max(0, dto.quantity || 0);
      if (qty <= 0) {
        throw new Error('INVALID_QUANTITY: Movement quantity must be greater than 0');
      }

      let delta = 0;
      if (dto.type === 'IN' || dto.type === 'ADJUSTMENT_IN') {
        delta = qty;
      } else if (dto.type === 'OUT' || dto.type === 'ADJUSTMENT_OUT') {
        delta = -qty;
      }

      const newStock = Number(((product.currentStock || 0) + delta).toFixed(2));

      // Anti-Negative Stock Rule
      if (newStock < 0) {
        throw new Error(
          `INSUFFICIENT_STOCK: Requested ${qty} units, but available stock is ${product.currentStock}`
        );
      }

      // Update product current stock
      product.currentStock = newStock;

      const movement: StockMovementDto = {
        id: `mov-${crypto.randomUUID()}`,
        organizationId: orgId,
        productId: dto.productId,
        type: dto.type,
        quantity: qty,
        unitCost: dto.unitCost || product.purchaseCost,
        reason: dto.reason || '',
        referenceDocType: dto.referenceDocType,
        referenceDocId: dto.referenceDocId,
        createdBy: tenantContext.userId,
        createdAt: new Date().toISOString(),
        mutationId: dto.mutationId,
      };

      this.movementsStore.push(movement);
      if (dto.mutationId) {
        this.processedMutations.set(dto.mutationId, movement);
      }

      return movement;
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public static adjustStock(
    tenantContext: TenantContext,
    dto: StockAdjustmentDto,
    userPermissions: string[]
  ): StockMovementDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:adjust');
    const orgId = tenantContext.organizationId;

    if (dto.mutationId && this.processedMutations.has(dto.mutationId)) {
      return this.processedMutations.get(dto.mutationId);
    }

    const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);
    const product = products.find((p) => p.id === dto.productId && p.organizationId === orgId);

    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product ${dto.productId} not found`);
    }

    if (product.type === 'SERVICE') {
      throw new Error('NON_STOCKABLE_ITEM: Cannot adjust stock for SERVICE items');
    }

    const actualQty = Math.max(0, dto.actualQuantity || 0);
    const currentQty = product.currentStock || 0;
    const diff = Number((actualQty - currentQty).toFixed(2));

    if (diff === 0) {
      // No movement needed, stock is already accurate
      return {
        id: `mov-noop-${crypto.randomUUID()}`,
        organizationId: orgId,
        productId: dto.productId,
        type: 'ADJUSTMENT_IN',
        quantity: 0,
        reason: dto.reason || 'Inventaire (aucun écart)',
        createdBy: tenantContext.userId,
        createdAt: new Date().toISOString(),
        mutationId: dto.mutationId,
      };
    }

    const type = diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    const absQty = Math.abs(diff);

    return this.recordMovement(
      tenantContext,
      {
        productId: dto.productId,
        type,
        quantity: absQty,
        reason: dto.reason || `Ajustement inventaire (${currentQty} -> ${actualQty})`,
        mutationId: dto.mutationId,
      },
      ['nexus:stock:write']
    );
  }

  public static recordInvoiceStockOut(
    tenantContext: TenantContext,
    invoiceId: string,
    items: { productServiceId?: string; quantity: number }[],
    mutationId: string | undefined,
    userPermissions: string[]
  ): StockMovementDto[] {
    if (mutationId && this.processedMutations.has(`inv-stock-${mutationId}`)) {
      return this.processedMutations.get(`inv-stock-${mutationId}`);
    }

    const movements: StockMovementDto[] = [];
    const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);

    // Filter only stockable PRODUCT items
    const stockableItems = items.filter((item) => {
      if (!item.productServiceId) return false;
      const p = products.find((prod) => prod.id === item.productServiceId);
      return p && p.type === 'PRODUCT';
    });

    // Validate stock sufficiency for all stockable items prior to applying changes
    for (const item of stockableItems) {
      const p = products.find((prod) => prod.id === item.productServiceId)!;
      if ((p.currentStock || 0) < item.quantity) {
        throw new Error(
          `INSUFFICIENT_STOCK: Product ${p.name} (${p.reference}) has only ${p.currentStock} units in stock, required ${item.quantity}`
        );
      }
    }

    // Apply movements atomically
    for (const item of stockableItems) {
      const itemMutationId = mutationId ? `${mutationId}-${item.productServiceId}` : undefined;
      const mov = this.recordMovement(
        tenantContext,
        {
          productId: item.productServiceId!,
          type: 'OUT',
          quantity: item.quantity,
          reason: `Vente Facture N° ${invoiceId}`,
          referenceDocType: 'INVOICE',
          referenceDocId: invoiceId,
          mutationId: itemMutationId,
        },
        ['nexus:stock:write']
      );
      movements.push(mov);
    }

    if (mutationId) {
      this.processedMutations.set(`inv-stock-${mutationId}`, movements);
    }

    return movements;
  }

  public static clearAllForTesting(): void {
    this.movementsStore = [];
    this.processedMutations.clear();
    this.locks.clear();
  }
}
