export interface CompanyProfileDto {
  id: string;
  name: string;
  legalName?: string;
  logoUrl?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  currency: string;
  timezone: string;
}

export interface UpdateCompanyProfileDto {
  name?: string;
  legalName?: string;
  logoUrl?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  currency?: string;
  timezone?: string;
}
