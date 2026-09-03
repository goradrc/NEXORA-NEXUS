import { TenantContext, RolesGuard } from '@nexora/core';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxId?: string;
  taxNumber?: string;
  payableBalance: number;
  balanceDue?: number;
  paymentTerms?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export type SupplierDto = Supplier;

export interface CreateSupplierDto {
  name: string;
  code?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxId?: string;
  taxNumber?: string;
  payableBalance?: number;
  paymentTerms?: string;
}

export interface UpdateSupplierDto {
  name?: string;
  code?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxId?: string;
  taxNumber?: string;
  payableBalance?: number;
  paymentTerms?: string;
}

export interface SupplierFilterDto {
  search?: string;
}

export class SuppliersService {
  private suppliers: Supplier[] = [
    {
      id: 'sup-1',
      code: 'FRN-001',
      name: 'Fournisseur Matériels Tech',
      companyName: 'Tech Distri Global SARL',
      email: 'contact@techdistri.com',
      phone: '+33 1 40 00 11 22',
      address: '15 Avenue des Grossistes',
      city: 'Paris',
      taxId: 'FR 12 345 678 901',
      payableBalance: 3450.00,
      balanceDue: 3450.00,
      organizationId: 'org-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sup-2',
      code: 'FRN-002',
      name: 'Bureau & Papeterie Pro',
      companyName: 'Papeterie Centrale SAS',
      email: 'commandes@papeteriepro.fr',
      phone: '+33 4 72 00 33 44',
      address: '8 Rue des Imprimeurs',
      city: 'Lyon',
      taxId: 'FR 98 765 432 109',
      payableBalance: 0.00,
      balanceDue: 0.00,
      organizationId: 'org-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  getSuppliers(user: any, filter?: SupplierFilterDto): Supplier[] {
    RolesGuard.enforcePermission(user?.permissions || [], 'nexus:suppliers:read');
    let list = this.suppliers.filter(
      (s) => s.organizationId === user.organizationId,
    );

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.companyName && s.companyName.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)),
      );
    }

    return list;
  }

  getSupplierById(user: any, id: string): Supplier {
    RolesGuard.enforcePermission(user?.permissions || [], 'nexus:suppliers:read');
    const supplier = this.suppliers.find((s) => s.id === id);
    if (!supplier) {
      throw new Error(`Supplier with ID ${id} not found`);
    }
    if (supplier.organizationId !== user.organizationId) {
      throw new Error('Access denied to this supplier');
    }
    return supplier;
  }

  createSupplier(user: any, dto: CreateSupplierDto): Supplier {
    RolesGuard.enforcePermission(user?.permissions || [], 'nexus:suppliers:create');
    const count = this.suppliers.filter(
      (s) => s.organizationId === user.organizationId,
    ).length;
    const code = dto.code || `FRN-${(count + 1).toString().padStart(3, '0')}`;

    const newSupplier: Supplier = {
      id: `sup-${Date.now()}`,
      code,
      name: dto.name,
      companyName: dto.companyName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      taxId: dto.taxId || dto.taxNumber,
      taxNumber: dto.taxNumber || dto.taxId,
      payableBalance: dto.payableBalance || 0,
      balanceDue: dto.payableBalance || 0,
      paymentTerms: dto.paymentTerms || '30 NET',
      organizationId: user.organizationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.suppliers.push(newSupplier);
    return newSupplier;
  }

  updateSupplier(user: any, id: string, dto: UpdateSupplierDto): Supplier {
    RolesGuard.enforcePermission(user?.permissions || [], 'nexus:suppliers:update');
    const supplier = this.getSupplierById(user, id);

    Object.assign(supplier, dto, {
      updatedAt: new Date().toISOString(),
    });

    return supplier;
  }

  deleteSupplier(user: any, id: string): { success: boolean } {
    RolesGuard.enforcePermission(user?.permissions || [], 'nexus:suppliers:delete');
    const supplier = this.getSupplierById(user, id);
    this.suppliers = this.suppliers.filter((s) => s.id !== supplier.id);
    return { success: true };
  }
}
