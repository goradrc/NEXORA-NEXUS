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
}

export interface UpdateSupplierDto {
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  paymentTerms?: string;
}
