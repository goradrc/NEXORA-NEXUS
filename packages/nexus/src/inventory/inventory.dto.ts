export type InventoryStatus = 'DRAFT' | 'IN_PROGRESS' | 'VALIDATED' | 'CANCELLED';

export interface InventoryLineDto {
  id: string;
  inventoryId: string;
  productId: string;
  theoreticalQuantity: number;
  physicalQuantity?: number | null;
  varianceQuantity?: number | null;
  unitCost: number;
  varianceValue?: number | null;
  reason?: string;
}

export interface CreateInventoryLineDto {
  productId: string;
  reason?: string;
}

export interface CreateInventoryDto {
  notes?: string;
  scopeCategoryId?: string;
  lines?: CreateInventoryLineDto[];
}

export interface StartInventoryDto {
  inventoryId: string;
}

export interface UpdateInventoryCountDto {
  inventoryId: string;
  productId: string;
  physicalQuantity: number;
  reason?: string;
}

export interface ValidateInventoryDto {
  inventoryId: string;
  idempotencyKey: string;
}

export interface CancelInventoryDto {
  inventoryId: string;
  reason?: string;
}

export interface InventoryResponseDto {
  id: string;
  organizationId: string;
  inventoryNumber: string;
  status: InventoryStatus;
  notes?: string;
  createdBy?: string;
  validatedBy?: string;
  createdAt: string;
  validatedAt?: string;
  lines: InventoryLineDto[];
  idempotencyKey?: string;
}

/**
  Validation helper to enforce physicalQuantity >= 0 in DTO validation rules.
 */
export function validatePhysicalQuantity(quantity: number): boolean {
  if (typeof quantity !== 'number' || Number.isNaN(quantity)) {
    return false;
  }
  return quantity >= 0;
}
