export type SupplierStatus = 'ACTIVE' | 'INACTIVE';

export interface SupplierDto {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  notes?: string;
  status: SupplierStatus;
  balanceDue: number;
  paymentTerms?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  code?: string;
  name: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  notes?: string;
  paymentTerms?: string;
}

export interface UpdateSupplierDto {
  name?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  notes?: string;
  status?: SupplierStatus;
  paymentTerms?: string;
}
