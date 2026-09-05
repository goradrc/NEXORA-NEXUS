import { TenantContext } from '@nexora/core';

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
export type InvoiceStatus = 'DRAFT' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'MOBILE_MONEY' | 'CARD';

export class LineItemDto {
  id: string;
  productServiceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  totalPrice: number;
}

export class CreateLineItemDto {
  productServiceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercent?: number;
}

export class QuoteDto {
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
}

export class CreateQuoteDto {
  customerId: string;
  quoteNumber?: string;
  validUntil?: string;
  lineItems: CreateLineItemDto[];
}

export class UpdateQuoteDto {
  customerId?: string;
  status?: QuoteStatus;
  validUntil?: string;
  lineItems?: CreateLineItemDto[];
}

export class InvoiceDto {
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
}

export class CreateInvoiceDto {
  customerId: string;
  invoiceNumber?: string;
  quoteId?: string;
  dueDate?: string;
  lineItems: CreateLineItemDto[];
}

export class UpdateInvoiceDto {
  customerId?: string;
  status?: InvoiceStatus;
  dueDate?: string;
  lineItems?: CreateLineItemDto[];
}

export class PaymentDto {
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
}

export class RecordPaymentDto {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceCode?: string;
  paymentDate?: string;
}
