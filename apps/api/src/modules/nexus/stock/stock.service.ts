import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CreateStockMovementDto, MovementType, StockAlertDto } from '@nexora/nexus';
import { CatalogService } from '../catalog/catalog.service';

export interface StockMovementRecord {
  id: string;
  organizationId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  unitCost: number;
  reason?: string;
  referenceDocType?: string;
  referenceDocId?: string;
  createdBy?: string;
  createdAt: Date;
}

export class StockService {
  private static stockMovementsStore: StockMovementRecord[] = [];

  public static getMovements(
    tenantContext: TenantContext,
    userPermissions: string[],
    productId?: string
  ): StockMovementRecord[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:read');
    return this.stockMovementsStore.filter(
      m => m.organizationId === tenantContext.organizationId && (!productId || m.productId === productId)
    );
  }

  public static createMovement(
    tenantContext: TenantContext,
    dto: CreateStockMovementDto,
    userPermissions: string[]
  ): StockMovementRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:create');

    if (dto.quantity <= 0) {
      throw new Error('INVALID_QUANTITY: Movement quantity must be greater than zero');
    }

    const orgId = tenantContext.organizationId;
    const products = CatalogService.getProductsServices(tenantContext, userPermissions);
    const product = products.find(p => p.id === dto.productId && p.organizationId === orgId);

    if (!product) {
      throw new Error('PRODUCT_NOT_FOUND: Target product does not exist for this tenant');
    }

    if (product.type !== 'PRODUCT') {
      throw new Error('INVALID_PRODUCT_TYPE: Stock movements can only be applied to physical products');
    }

    // Calculate updated stock
    let stockDelta = 0;
    if (dto.type === MovementType.IN) {
      stockDelta = dto.quantity;
    } else if (dto.type === MovementType.OUT) {
      if (product.currentStock < dto.quantity) {
        throw new Error(`INSUFFICIENT_STOCK: Available stock (${product.currentStock}) is lower than requested (${dto.quantity})`);
      }
      stockDelta = -dto.quantity;
    } else if (dto.type === MovementType.ADJUSTMENT) {
      stockDelta = dto.quantity - product.currentStock;
    }

    product.currentStock += stockDelta;

    const movement: StockMovementRecord = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: orgId,
      productId: dto.productId,
      type: dto.type,
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      reason: dto.reason,
      referenceDocType: dto.referenceDocType,
      referenceDocId: dto.referenceDocId,
      createdBy: tenantContext.userId,
      createdAt: new Date(),
    };

    this.stockMovementsStore.push(movement);

    AuditService.log({
      organizationId: orgId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'StockMovement',
      entityId: movement.id,
      changes: {
        type: dto.type,
        productId: dto.productId,
        quantity: dto.quantity,
        newCurrentStock: product.currentStock,
      },
    });

    return movement;
  }

  public static getStockAlerts(
    tenantContext: TenantContext,
    userPermissions: string[]
  ): StockAlertDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:stock:read');
    const products = CatalogService.getProductsServices(tenantContext, userPermissions);

    return products
      .filter(p => p.type === 'PRODUCT' && p.currentStock <= p.minStockAlert)
      .map(p => ({
        productId: p.id,
        reference: p.reference,
        name: p.name,
        currentStock: p.currentStock,
        minStockAlert: p.minStockAlert,
        deficitQuantity: Math.max(0, p.minStockAlert - p.currentStock),
      }));
  }

  public static clearStoreForTesting(): void {
    this.stockMovementsStore = [];
  }
}
