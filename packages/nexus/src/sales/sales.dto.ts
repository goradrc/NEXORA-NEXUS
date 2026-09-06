export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
export type InvoiceStatus = 'DRAFT' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type DeliveryStatus = 'DRAFT' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'MOBILE_MONEY' | 'CARD';

export interface LineItemDto {
  id: string;
  productServiceId?: string;
  quoteId?: string;
  invoiceId?: string;
  deliveryNoteId?: string;
  purchaseOrderId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  totalPrice: number;
}

export interface CreateLineItemDto {
  productServiceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercent?: number;
}

export interface QuoteDto {
  id: string;
  organizationId: string;
  customerId: string;
  quoteNumber: string;
  status: QuoteStatus;
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  validUntil: string;
  createdAt: string;
  lineItems: LineItemDto[];
  idempotencyKey?: string;
}

export interface CreateQuoteDto {
  customerId: string;
  validUntil: string;
  lineItems: CreateLineItemDto[];
  idempotencyKey?: string;
}

export interface UpdateQuoteDto {
  customerId?: string;
  validUntil?: string;
  lineItems?: CreateLineItemDto[];
}

export interface InvoiceDto {
  id: string;
  organizationId: string;
  customerId: string;
  quoteId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  createdAt: string;
  lineItems: LineItemDto[];
  deliveryNoteIds?: string[];
  idempotencyKey?: string;
}

export interface CreateInvoiceDto {
  customerId: string;
  quoteId?: string;
  dueDate: string;
  lineItems: CreateLineItemDto[];
  deliveryNoteIds?: string[];
  idempotencyKey?: string;
}

export interface UpdateInvoiceDto {
  customerId?: string;
  dueDate?: string;
  lineItems?: CreateLineItemDto[];
  notes?: string;
}

export interface DeliveryNoteDto {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  deliveryNumber: string;
  status: DeliveryStatus;
  shippingAddress?: string;
  carrierName?: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  notes?: string;
  createdAt: string;
  lineItems: LineItemDto[];
  idempotencyKey?: string;
}

export interface CreateDeliveryNoteDto {
  customerId: string;
  invoiceId?: string;
  quoteId?: string;
  shippingAddress?: string;
  carrierName?: string;
  trackingNumber?: string;
  notes?: string;
  lineItems: CreateLineItemDto[];
  idempotencyKey?: string;
}

export interface UpdateDeliveryNoteDto {
  shippingAddress?: string;
  carrierName?: string;
  trackingNumber?: string;
  notes?: string;
  lineItems?: CreateLineItemDto[];
}

export interface PaymentDto {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId: string;
  paymentNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceCode?: string;
  paymentDate: string;
  createdAt: string;
  idempotencyKey?: string;
}

export interface CreatePaymentDto {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceCode?: string;
  paymentDate?: string;
  idempotencyKey?: string;
}

export interface CancelPaymentDto {
  reason: string;
}
