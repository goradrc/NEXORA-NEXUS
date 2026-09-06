export type POStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderLineItemDto {
  id: string;
  productServiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  totalPrice: number;
  quantityReceived?: number;
  quantityRemaining?: number;
}

export interface PurchaseReceiptLineDto {
  id: string;
  purchaseReceiptId: string;
  lineItemId: string;
  quantityReceived: number;
}

export interface PurchaseReceiptDto {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  receiptNumber: string;
  idempotencyKey: string;
  receivedAt: string;
  createdBy?: string;
  notes?: string;
  lines: PurchaseReceiptLineDto[];
  createdAt: string;
}

export interface CreatePurchaseReceiptLineDto {
  lineItemId: string;
  quantityReceived: number;
}

export interface CreatePurchaseReceiptDto {
  idempotencyKey: string;
  receivedAt?: string;
  notes?: string;
  lines: CreatePurchaseReceiptLineDto[];
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
  receipts?: PurchaseReceiptDto[];
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
