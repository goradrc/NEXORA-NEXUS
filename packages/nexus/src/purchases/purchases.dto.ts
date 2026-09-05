export type POStatus =
  | 'DRAFT'
  | 'SENT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface PurchaseOrderLineDto {
  id: string;
  productId?: string;
  designationSnapshot: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  discountPercent?: number;
  taxRate?: number;
  lineTotal: number;
}

export interface PurchaseOrderDto {
  id: string;
  organizationId: string;
  supplierId: string;
  orderNumber: string;
  status: POStatus;
  orderDate: string;
  expectedDate?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  totalAmount: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  mutationId?: string;
  lines: PurchaseOrderLineDto[];
}

export interface CreatePurchaseOrderLineDto {
  productId?: string;
  designationSnapshot: string;
  quantityOrdered: number;
  unitCost: number;
  discountPercent?: number;
  taxRate?: number;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  orderNumber?: string;
  expectedDate?: string;
  notes?: string;
  mutationId?: string;
  lines: CreatePurchaseOrderLineDto[];
}
