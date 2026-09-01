export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export interface CreateStockMovementDto {
  organizationId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  unitCost: number;
  reason?: string;
  referenceDocType?: string;
  referenceDocId?: string;
  createdBy?: string;
}

export interface StockAlertDto {
  productId: string;
  reference: string;
  name: string;
  currentStock: number;
  minStockAlert: number;
  deficitQuantity: number;
}
