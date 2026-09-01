import { PaymentMethod } from '../expenses/expenses.dto';

export interface CreatePaymentDto {
  organizationId: string;
  customerId: string;
  invoiceId: string;
  paymentNumber?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceCode?: string;
  paymentDate?: Date;
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
  paymentDate: Date;
  createdAt: Date;
}
