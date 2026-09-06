export type SupplierStatus = 'ACTIVE' | 'INACTIVE';

export interface SupplierDto {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  balanceDue: number;
  paymentTerms?: string;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  code?: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  paymentTerms?: string;
  status?: SupplierStatus;
}

export interface UpdateSupplierDto {
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  paymentTerms?: string;
  status?: SupplierStatus;
}
