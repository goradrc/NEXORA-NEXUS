import { TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';
import {
  PurchaseOrderDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderLineItemDto,
  PurchaseReceiptDto,
  PurchaseReceiptLineDto,
  CreatePurchaseReceiptDto,
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
  purchaseReceiptLineId?: string;
  createdAt: string;
}

export interface PurchaseReceiptSequenceRecord {
  organizationId: string;
  year: number;
  nextNumber: number;
}

export interface StoredPurchaseReceipt {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  receiptNumber: string;
  idempotencyKey: string;
  payloadHash: string;
  receivedAt: string;
  createdBy?: string;
  notes?: string;
  lines: PurchaseReceiptLineDto[];
  createdAt: string;
}

export class PurchaseOrdersService {
  private static purchaseOrdersStore: PurchaseOrderDto[] = [];
  private static stockMovementsStore: RecordedStockMovement[] = [];
  private static purchaseReceiptsStore: StoredPurchaseReceipt[] = [];
  private static sequencesStore: PurchaseReceiptSequenceRecord[] = [];

  public static getStockMovements(tenantContext: TenantContext): RecordedStockMovement[] {
    return this.stockMovementsStore.filter((m) => m.organizationId === tenantContext.organizationId);
  }

  public static getReceipts(tenantContext: TenantContext, purchaseOrderId?: string): PurchaseReceiptDto[] {
    return this.purchaseReceiptsStore
      .filter((r) => r.organizationId === tenantContext.organizationId && (!purchaseOrderId || r.purchaseOrderId === purchaseOrderId))
      .map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        purchaseOrderId: r.purchaseOrderId,
        receiptNumber: r.receiptNumber,
        idempotencyKey: r.idempotencyKey,
        receivedAt: r.receivedAt,
        createdBy: r.createdBy,
        notes: r.notes,
        lines: r.lines,
        createdAt: r.createdAt,
      }));
  }

  public static clearStoreForTesting(): void {
    this.purchaseOrdersStore = [];
    this.stockMovementsStore = [];
    this.purchaseReceiptsStore = [];
    this.sequencesStore = [];
  }

  // Calculate cumulative quantity received for a line item
  public static getLineItemReceivedQuantity(tenantContext: TenantContext, lineItemId: string): number {
    let total = 0;
    const orgReceipts = this.purchaseReceiptsStore.filter((r) => r.organizationId === tenantContext.organizationId);
    for (const receipt of orgReceipts) {
      for (const line of receipt.lines) {
        if (line.lineItemId === lineItemId) {
          total += line.quantityReceived;
        }
      }
    }
    return total;
  }

  public static populateLineItemQuantities(tenantContext: TenantContext, po: PurchaseOrderDto): PurchaseOrderDto {
    const updatedLines = po.lineItems.map((line) => {
      const received = this.getLineItemReceivedQuantity(tenantContext, line.id);
      const remaining = Math.max(0, line.quantity - received);
      return {
        ...line,
        quantityReceived: received,
        quantityRemaining: Number(remaining.toFixed(4)),
      };
    });

    const receipts = this.getReceipts(tenantContext, po.id);

    return {
      ...po,
      lineItems: updatedLines,
      receipts,
    };
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): PurchaseOrderDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:read');
    return this.purchaseOrdersStore
      .filter((po) => po.organizationId === tenantContext.organizationId)
      .map((po) => this.populateLineItemQuantities(tenantContext, po));
  }

  public static findOne(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:read');
    const po = this.purchaseOrdersStore.find(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );
    if (!po) {
      throw new Error(`PURCHASE_ORDER_NOT_FOUND: Purchase order ${id} not found or cross-tenant access denied`);
    }
    return this.populateLineItemQuantities(tenantContext, po);
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
        id: `line-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        productServiceId: line.productServiceId,
        description: line.description || product.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate,
        totalPrice: Number(lineTotal.toFixed(2)),
        quantityReceived: 0,
        quantityRemaining: line.quantity,
      });
    }

    const orgOrders = this.purchaseOrdersStore.filter((p) => p.organizationId === tenantContext.organizationId);
    const nextNumber = orgOrders.length + 1;
    const formattedPoNumber = dto.poNumber || `CMD-ACH-${String(nextNumber).padStart(3, '0')}`;

    const newPO: PurchaseOrderDto = {
      id: `po-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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
    return this.populateLineItemQuantities(tenantContext, newPO);
  }

  public static update(
    tenantContext: TenantContext,
    id: string,
    dto: UpdatePurchaseOrderDto,
    userPermissions: string[]
  ): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:update');
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status === 'PARTIALLY_RECEIVED' || po.status === 'RECEIVED' || po.status === 'CANCELLED') {
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
          id: `line-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          productServiceId: line.productServiceId,
          description: line.description || product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate,
          totalPrice: Number(lineTotal.toFixed(2)),
          quantityReceived: 0,
          quantityRemaining: line.quantity,
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
    return this.populateLineItemQuantities(tenantContext, updatedPO);
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
    return this.populateLineItemQuantities(tenantContext, updatedPO);
  }

  // Sequence generator for purchase receipt numbers: REC-YYYY-XXXX
  private static generateNextReceiptNumber(organizationId: string, receivedDate: Date): string {
    const year = receivedDate.getFullYear();
    let seq = this.sequencesStore.find((s) => s.organizationId === organizationId && s.year === year);
    if (!seq) {
      seq = { organizationId, year, nextNumber: 1 };
      this.sequencesStore.push(seq);
    }
    const currentNum = seq.nextNumber;
    seq.nextNumber += 1;
    return `REC-${year}-${String(currentNum).padStart(4, '0')}`;
  }

  // Hash payload helper for idempotency check
  private static hashReceiptPayload(lines: { lineItemId: string; quantityReceived: number }[]): string {
    const sorted = [...lines].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId));
    return JSON.stringify(sorted.map((l) => ({ id: l.lineItemId, qty: l.quantityReceived })));
  }

  // Create Purchase Receipt (2D-C)
  public static createReceipt(
    tenantContext: TenantContext,
    id: string,
    dto: CreatePurchaseReceiptDto,
    userPermissions: string[]
  ): PurchaseReceiptDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:update');

    if (!dto.idempotencyKey) {
      throw new Error('IDEMPOTENCY_KEY_REQUIRED: idempotencyKey is required for purchase receipts');
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new Error('INVALID_RECEIPT_LINES: At least one receipt line is required');
    }

    const payloadHash = this.hashReceiptPayload(dto.lines);

    // 1. Check Idempotency Key
    const existingReceipt = this.purchaseReceiptsStore.find(
      (r) => r.organizationId === tenantContext.organizationId && r.idempotencyKey === dto.idempotencyKey
    );

    if (existingReceipt) {
      if (existingReceipt.payloadHash === payloadHash) {
        // Same key + same payload -> return existing receipt
        return {
          id: existingReceipt.id,
          organizationId: existingReceipt.organizationId,
          purchaseOrderId: existingReceipt.purchaseOrderId,
          receiptNumber: existingReceipt.receiptNumber,
          idempotencyKey: existingReceipt.idempotencyKey,
          receivedAt: existingReceipt.receivedAt,
          createdBy: existingReceipt.createdBy,
          notes: existingReceipt.notes,
          lines: existingReceipt.lines,
          createdAt: existingReceipt.createdAt,
        };
      } else {
        // Same key + different payload -> IDEMPOTENCY_KEY_PAYLOAD_MISMATCH
        throw new Error('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Provided idempotencyKey has already been used with a different payload');
      }
    }

    // 2. Fetch and lock PO
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status === 'RECEIVED') {
      throw new Error(`PO_ALREADY_RECEIVED: Purchase order ${id} has already been fully received`);
    }
    if (po.status === 'CANCELLED') {
      throw new Error('INVALID_PO_STATUS_TRANSITION: Cannot receive a CANCELLED purchase order');
    }

    // 3. Validate line quantities and compute remaining
    const products = CatalogService.getProductsServices(tenantContext, ['nexus:catalog:read']);
    const receiptLines: PurchaseReceiptLineDto[] = [];
    const stockMovementsToCreate: RecordedStockMovement[] = [];
    const receiptId = `rec-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const receivedDate = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    const receiptNumber = this.generateNextReceiptNumber(tenantContext.organizationId, receivedDate);

    for (const reqLine of dto.lines) {
      if (reqLine.quantityReceived <= 0) {
        throw new Error(`INVALID_RECEIPT_QUANTITY: Quantity received must be greater than 0 (got ${reqLine.quantityReceived})`);
      }

      const poLine = po.lineItems.find((l) => l.id === reqLine.lineItemId);
      if (!poLine) {
        throw new Error(`LINE_ITEM_NOT_FOUND: Line item ${reqLine.lineItemId} does not belong to purchase order ${id}`);
      }

      const cumulativeReceived = this.getLineItemReceivedQuantity(tenantContext, poLine.id);
      const remaining = poLine.quantity - cumulativeReceived;

      if (reqLine.quantityReceived > remaining + 0.0001) {
        throw new Error(`OVER_RECEIPT_EXCEEDED: Cannot receive ${reqLine.quantityReceived} units for line ${poLine.id}. Remaining quantity is ${remaining}`);
      }

      const receiptLineId = `reclines-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      receiptLines.push({
        id: receiptLineId,
        purchaseReceiptId: receiptId,
        lineItemId: poLine.id,
        quantityReceived: reqLine.quantityReceived,
      });

      // Stock integration rules: PRODUCT vs SERVICE
      const product = products.find((p) => p.id === poLine.productServiceId);
      if (product && product.type === 'PRODUCT') {
        product.currentStock += reqLine.quantityReceived;

        stockMovementsToCreate.push({
          id: `mvt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          organizationId: tenantContext.organizationId,
          productId: product.id,
          type: 'IN',
          quantity: reqLine.quantityReceived,
          unitCost: poLine.unitPrice,
          reason: `Reception ${receiptNumber} (Commande ${po.poNumber})`,
          referenceDocType: 'PURCHASE_RECEIPT',
          referenceDocId: receiptId,
          purchaseReceiptLineId: receiptLineId,
          createdAt: receivedDate.toISOString(),
        });
      }
    }

    // 4. Commit Stock Movements and Receipt to Store
    this.stockMovementsStore.push(...stockMovementsToCreate);

    const storedReceipt: StoredPurchaseReceipt = {
      id: receiptId,
      organizationId: tenantContext.organizationId,
      purchaseOrderId: po.id,
      receiptNumber,
      idempotencyKey: dto.idempotencyKey,
      payloadHash,
      receivedAt: receivedDate.toISOString(),
      createdBy: tenantContext.userId,
      notes: dto.notes,
      lines: receiptLines,
      createdAt: new Date().toISOString(),
    };
    this.purchaseReceiptsStore.push(storedReceipt);

    // 5. Compute new PO Status
    const poIndex = this.purchaseOrdersStore.findIndex(
      (p) => p.id === id && p.organizationId === tenantContext.organizationId
    );

    let allFullyReceived = true;
    for (const poLine of po.lineItems) {
      const updatedCumul = this.getLineItemReceivedQuantity(tenantContext, poLine.id);
      if (updatedCumul < poLine.quantity - 0.0001) {
        allFullyReceived = false;
        break;
      }
    }

    const newStatus: POStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    this.purchaseOrdersStore[poIndex] = {
      ...po,
      status: newStatus,
      receivedAt: allFullyReceived ? new Date().toISOString() : po.receivedAt,
      updatedAt: new Date().toISOString(),
    };

    return {
      id: storedReceipt.id,
      organizationId: storedReceipt.organizationId,
      purchaseOrderId: storedReceipt.purchaseOrderId,
      receiptNumber: storedReceipt.receiptNumber,
      idempotencyKey: storedReceipt.idempotencyKey,
      receivedAt: storedReceipt.receivedAt,
      createdBy: storedReceipt.createdBy,
      notes: storedReceipt.notes,
      lines: storedReceipt.lines,
      createdAt: storedReceipt.createdAt,
    };
  }

  // Legacy 2C receive helper (full receipt for backward compatibility)
  public static receive(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    const po = this.findOne(tenantContext, id, userPermissions);
    const linesToReceive = po.lineItems
      .filter((l) => (l.quantityRemaining ?? l.quantity) > 0)
      .map((l) => ({
        lineItemId: l.id,
        quantityReceived: l.quantityRemaining ?? l.quantity,
      }));

    this.createReceipt(
      tenantContext,
      id,
      {
        idempotencyKey: `auto-receive-${po.id}-${Date.now()}`,
        lines: linesToReceive,
        notes: 'Réception automatique intégrale (legacy 2C)',
      },
      userPermissions
    );

    return this.findOne(tenantContext, id, userPermissions);
  }

  // Legacy 2C PO Migration Helper
  public static migrateLegacy2CReceivedOrder(tenantContext: TenantContext, poId: string): PurchaseReceiptDto | null {
    const poIndex = this.purchaseOrdersStore.findIndex(
      (p) => p.id === poId && p.organizationId === tenantContext.organizationId
    );
    if (poIndex === -1) return null;

    const po = this.purchaseOrdersStore[poIndex];
    if (po.status !== 'RECEIVED') return null;

    const idempotencyKey = `migration-2c-po-${po.id}`;

    // Check if synthetic receipt already exists
    const existing = this.purchaseReceiptsStore.find(
      (r) => r.organizationId === tenantContext.organizationId && r.idempotencyKey === idempotencyKey
    );
    if (existing) {
      return {
        id: existing.id,
        organizationId: existing.organizationId,
        purchaseOrderId: existing.purchaseOrderId,
        receiptNumber: existing.receiptNumber,
        idempotencyKey: existing.idempotencyKey,
        receivedAt: existing.receivedAt,
        createdBy: existing.createdBy,
        notes: existing.notes,
        lines: existing.lines,
        createdAt: existing.createdAt,
      };
    }

    const receiptId = `rec-hist-${po.id}`;
    const receiptNumber = `REC-HIST-${po.poNumber}`;
    const receiptLines: PurchaseReceiptLineDto[] = po.lineItems.map((line) => ({
      id: `recline-hist-${line.id}`,
      purchaseReceiptId: receiptId,
      lineItemId: line.id,
      quantityReceived: line.quantity,
    }));

    const storedReceipt: StoredPurchaseReceipt = {
      id: receiptId,
      organizationId: tenantContext.organizationId,
      purchaseOrderId: po.id,
      receiptNumber,
      idempotencyKey,
      payloadHash: this.hashReceiptPayload(receiptLines.map((l) => ({ lineItemId: l.lineItemId, quantityReceived: l.quantityReceived }))),
      receivedAt: po.updatedAt || new Date().toISOString(),
      createdBy: tenantContext.userId,
      notes: 'Migration automatique des réceptions de l\'étape 2C (SANS mouvement de stock)',
      lines: receiptLines,
      createdAt: new Date().toISOString(),
    };

    // CRITICAL: NO stock movement is created, currentStock is NOT modified
    this.purchaseReceiptsStore.push(storedReceipt);

    return {
      id: storedReceipt.id,
      organizationId: storedReceipt.organizationId,
      purchaseOrderId: storedReceipt.purchaseOrderId,
      receiptNumber: storedReceipt.receiptNumber,
      idempotencyKey: storedReceipt.idempotencyKey,
      receivedAt: storedReceipt.receivedAt,
      createdBy: storedReceipt.createdBy,
      notes: storedReceipt.notes,
      lines: storedReceipt.lines,
      createdAt: storedReceipt.createdAt,
    };
  }

  public static cancel(tenantContext: TenantContext, id: string, userPermissions: string[]): PurchaseOrderDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:purchase-orders:delete');
    const po = this.findOne(tenantContext, id, userPermissions);

    if (po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') {
      throw new Error('INVALID_PO_STATUS_TRANSITION: Cannot cancel a purchase order with existing physical stock receipts');
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
    return this.populateLineItemQuantities(tenantContext, updatedPO);
  }
}
