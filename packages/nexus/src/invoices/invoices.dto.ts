import { CreateLineItemDto, LineItemDto } from '../quotes/quotes.dto';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export interface CreateInvoiceDto {
  organizationId: string;
  customerId: string;
  quoteId?: string;
  invoiceNumber?: string;
  dueDate?: Date;
  lineItems: CreateLineItemDto[];
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
  dueDate: Date;
  createdAt: Date;
  lineItems: LineItemDto[];
}
