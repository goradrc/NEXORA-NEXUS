export interface CustomerDto {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerDto {
  code?: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
}

export interface UpdateCustomerDto {
  name?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
}
