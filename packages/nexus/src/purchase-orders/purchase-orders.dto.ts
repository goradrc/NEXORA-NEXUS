export type POStatus = 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderLineItemDto {
  id: string;
  productServiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  totalPrice: number;
}

export interface PurchaseOrderDto {
  id: string;
  organizationId: string;
  supplierId: string;
  poNumber: string;
  status: POStatus;
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  orderDate: string;
  expectedDate?: string;
  receivedAt?: string;
  cancelledAt?: string;
  notes?: string;
  lineItems: PurchaseOrderLineItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderLineItemDto {
  productServiceId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  poNumber?: string;
  expectedDate?: string;
  notes?: string;
  lineItems: CreatePurchaseOrderLineItemDto[];
}

export interface UpdatePurchaseOrderDto {
  supplierId?: string;
  expectedDate?: string;
  notes?: string;
  lineItems?: CreatePurchaseOrderLineItemDto[];
}
