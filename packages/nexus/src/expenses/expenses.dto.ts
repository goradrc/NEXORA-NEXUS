export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CARD = 'CARD',
}

export interface CreateExpenseDto {
  organizationId: string;
  categoryId: string;
  supplierId?: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  receiptUrl?: string;
  expenseDate?: Date;
}

export interface UpdateExpenseDto {
  categoryId?: string;
  supplierId?: string;
  description?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  receiptUrl?: string;
  expenseDate?: Date;
}
