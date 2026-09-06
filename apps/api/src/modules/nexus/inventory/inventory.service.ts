import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import {
  InventoryResponseDto,
  CreateInventoryDto,
  UpdateInventoryCountDto,
  ValidateInventoryDto,
  CancelInventoryDto,
  InventoryLineDto,
  validatePhysicalQuantity,
} from '@nexora/nexus';
import { CatalogService } from '../catalog/catalog.service';
import { StockService } from '../stock/stock.service';

export class InventoryService {
  private static inventoryStore: InventoryResponseDto[] = [];
  private static sequenceStore: Record<string, number> = {};

  private static getNextNumber(organizationId: string): string {
    const year = new Date().getFullYear();
    const key = `${organizationId}-${year}`;
    this.sequenceStore[key] = (this.sequenceStore[key] || 0) + 1;
    const seq = String(this.sequenceStore[key]).padStart(4, '0');
    return `INV-${year}-${seq}`;
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): InventoryResponseDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:read');
    return this.inventoryStore.filter((i) => i.organizationId === tenantContext.organizationId);
  }

  public static findOne(
    tenantContext: TenantContext,
    inventoryId: string,
    userPermissions: string[]
  ): InventoryResponseDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:read');
    const inventory = this.inventoryStore.find(
      (i) => i.id === inventoryId && i.organizationId === tenantContext.organizationId
    );
    if (!inventory) {
      throw new Error(`INVENTORY_NOT_FOUND: Inventory ${inventoryId} not found or cross-tenant access denied`);
    }
    return inventory;
  }

  public static create(
    tenantContext: TenantContext,
    dto: CreateInventoryDto,
    userPermissions: string[]
  ): InventoryResponseDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:create');

    const inventoryId = `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const inventory: InventoryResponseDto = {
      id: inventoryId,
      organizationId: tenantContext.organizationId,
      inventoryNumber: this.getNextNumber(tenantContext.organizationId),
      status: 'DRAFT',
      notes: dto.notes,
      createdBy: tenantContext.userId,
      createdAt: new Date().toISOString(),
      lines: [],
    };

    this.inventoryStore.push(inventory);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CREATE_INVENTORY',
      entityName: 'Inventory',
      entityId: inventory.id,
    });

    return inventory;
  }

  public static start(
    tenantContext: TenantContext,
    inventoryId: string,
    userPermissions: string[]
  ): InventoryResponseDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:write');
    const inventory = this.findOne(tenantContext, inventoryId, userPermissions);

    if (inventory.status !== 'DRAFT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot start inventory in status [${inventory.status}]`);
    }

    // Capture snapshot for all stockable PRODUCT items (excluding SERVICE items)
    const products = CatalogService.getProductsServices(tenantContext, userPermissions);
    const stockableProducts = products.filter((p) => p.type === 'PRODUCT');

    const lines: InventoryLineDto[] = stockableProducts.map((product, idx) => ({
      id: `inv-line-${Date.now()}-${idx}`,
      inventoryId: inventory.id,
      productId: product.id,
      theoreticalQuantity: product.currentStock,
      physicalQuantity: null,
      varianceQuantity: null,
      unitCost: product.purchaseCost || 0,
      varianceValue: null,
    }));

    inventory.status = 'IN_PROGRESS';
    inventory.lines = lines;

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'START_INVENTORY',
      entityName: 'Inventory',
      entityId: inventory.id,
      changes: { productCount: lines.length },
    });

    return inventory;
  }

  public static updateCount(
    tenantContext: TenantContext,
    dto: UpdateInventoryCountDto,
    userPermissions: string[]
  ): InventoryResponseDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:write');
    const inventory = this.findOne(tenantContext, dto.inventoryId, userPermissions);

    if (inventory.status !== 'IN_PROGRESS') {
      throw new Error(`INVENTORY_LOCKED: Cannot update physical count for inventory in status [${inventory.status}]`);
    }

    if (!validatePhysicalQuantity(dto.physicalQuantity)) {
      throw new Error(`INVALID_PHYSICAL_QUANTITY: physicalQuantity must be a non-negative number`);
    }

    const line = inventory.lines.find((l) => l.productId === dto.productId);
    if (!line) {
      throw new Error(`PRODUCT_NOT_IN_INVENTORY: Product ${dto.productId} is not part of this inventory session`);
    }

    line.physicalQuantity = dto.physicalQuantity;
    line.varianceQuantity = dto.physicalQuantity - line.theoreticalQuantity;
    line.varianceValue = line.varianceQuantity * line.unitCost;
    if (dto.reason) {
      line.reason = dto.reason;
    }

    return inventory;
  }

  public static validateInventory(
    tenantContext: TenantContext,
    dto: ValidateInventoryDto,
    userPermissions: string[]
  ): InventoryResponseDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:validate');

    if (!dto.idempotencyKey || dto.idempotencyKey.trim() === '') {
      throw new Error(`IDEMPOTENCY_KEY_REQUIRED: ValidateInventory requires a non-empty idempotencyKey`);
    }

    // Check if idempotencyKey is already used by ANOTHER inventory in the same organization
    const keyUsedByOther = this.inventoryStore.find(
      (i) =>
        i.organizationId === tenantContext.organizationId &&
        i.idempotencyKey === dto.idempotencyKey &&
        i.id !== dto.inventoryId
    );
    if (keyUsedByOther) {
      const err = new Error(`IDEMPOTENCY_KEY_REUSED: Clé d'idempotence déjà utilisée pour un autre inventaire`);
      (err as any).statusCode = 409;
      throw err;
    }

    const inventory = this.findOne(tenantContext, dto.inventoryId, userPermissions);

    // If already VALIDATED with the SAME idempotencyKey, return existing validated inventory idempotently
    if (inventory.status === 'VALIDATED') {
      if (inventory.idempotencyKey === dto.idempotencyKey) {
        return inventory;
      }
      throw new Error(`INVENTORY_LOCKED: Inventory ${dto.inventoryId} is already VALIDATED`);
    }

    if (inventory.status !== 'IN_PROGRESS') {
      throw new Error(`INVALID_STATUS_TRANSITION: Cannot validate inventory in status [${inventory.status}]`);
    }

    inventory.idempotencyKey = dto.idempotencyKey;

    // Deterministic product sorting by productId ASC to prevent deadlocks
    const sortedLines = [...inventory.lines].sort((a, b) => a.productId.localeCompare(b.productId));

    const products = CatalogService.getProductsServices(tenantContext, userPermissions);

    // Execute atomic calculation and stock adjustments against real-time current stock
    for (const line of sortedLines) {
      if (line.physicalQuantity === null || line.physicalQuantity === undefined) {
        continue;
      }

      const product = products.find((p) => p.id === line.productId);
      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND: Product ${line.productId} not found during validation`);
      }

      const currentStockAtValidation = product.currentStock;
      const adjustmentQuantity = line.physicalQuantity - currentStockAtValidation;

      if (adjustmentQuantity !== 0) {
        StockService.recordAdjustmentMovement(
          tenantContext,
          {
            productId: line.productId,
            adjustmentQuantity,
            unitCost: line.unitCost,
            referenceDocType: 'INVENTORY',
            referenceDocId: inventory.id,
            reason:
              adjustmentQuantity > 0
                ? `Régularisation inventaire #${inventory.inventoryNumber} (Excédent)`
                : `Régularisation inventaire #${inventory.inventoryNumber} (Manquant)`,
          },
          userPermissions
        );
      }

      line.varianceQuantity = line.physicalQuantity - line.theoreticalQuantity;
      line.varianceValue = line.varianceQuantity * line.unitCost;
    }

    inventory.status = 'VALIDATED';
    inventory.validatedBy = tenantContext.userId;
    inventory.validatedAt = new Date().toISOString();

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'VALIDATE_INVENTORY',
      entityName: 'Inventory',
      entityId: inventory.id,
    });

    return inventory;
  }

  public static cancelInventory(
    tenantContext: TenantContext,
    dto: CancelInventoryDto,
    userPermissions: string[]
  ): InventoryResponseDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:inventory:cancel');
    const inventory = this.findOne(tenantContext, dto.inventoryId, userPermissions);

    if (inventory.status === 'VALIDATED' || inventory.status === 'CANCELLED') {
      throw new Error(`INVENTORY_LOCKED: Cannot cancel inventory in status [${inventory.status}]`);
    }

    inventory.status = 'CANCELLED';
    if (dto.reason) {
      inventory.notes = dto.reason;
    }

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CANCEL_INVENTORY',
      entityName: 'Inventory',
      entityId: inventory.id,
      changes: { reason: dto.reason },
    });

    return inventory;
  }

  public static clearStoreForTesting(): void {
    this.inventoryStore = [];
    this.sequenceStore = {};
  }
}
