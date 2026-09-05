export type StockLevelStatus = 'NORMAL' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export class StockMovementDto {
  id: string;
  organizationId: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  unitCost?: number;
  reason?: string;
  referenceDocType?: string;
  referenceDocId?: string;
  createdBy?: string;
  createdAt: string;
  mutationId?: string;
}

export class CreateStockMovementDto {
  productId: string;
  type: StockMovementType;
  quantity: number;
  unitCost?: number;
  reason?: string;
  referenceDocType?: string;
  referenceDocId?: string;
  mutationId?: string;
}

export class StockAdjustmentDto {
  productId: string;
  actualQuantity: number;
  reason?: string;
  mutationId?: string;
}

export class ProductStockStatusDto {
  productId: string;
  productName: string;
  reference: string;
  type: 'PRODUCT' | 'SERVICE';
  currentStock: number;
  minStockAlert: number;
  status: StockLevelStatus;
  unit: string;
}
