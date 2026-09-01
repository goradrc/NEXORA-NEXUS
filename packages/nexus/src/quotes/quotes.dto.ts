export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED',
}

export interface CreateLineItemDto {
  productServiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercent?: number;
}

export interface LineItemDto extends CreateLineItemDto {
  id: string;
  totalPrice: number;
}

export interface CreateQuoteDto {
  organizationId: string;
  customerId: string;
  quoteNumber?: string;
  validUntil?: Date;
  lineItems: CreateLineItemDto[];
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
  validUntil: Date;
  createdAt: Date;
  lineItems: LineItemDto[];
}
