import { TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';
import { SupplierDto, CreateSupplierDto, UpdateSupplierDto, SupplierStatus } from '@nexora/nexus';

export class SuppliersService {
  private static suppliersStore: SupplierDto[] = [
    {
      id: 'sup-001',
      organizationId: 'org-1',
      code: 'FOURN-001',
      name: 'Supplier Industrial Ltd',
      companyName: 'Industrial Hardware',
      email: 'sales@industrial.com',
      balanceDue: 2500,
      paymentTerms: '30 NET',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): SupplierDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:read');
    return this.suppliersStore.filter(s => s.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, id: string, userPermissions: string[]): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:read');
    const supplier = this.suppliersStore.find(
      s => s.id === id && s.organizationId === tenantContext.organizationId
    );
    if (!supplier) {
      throw new Error(`SUPPLIER_NOT_FOUND: Supplier ${id} not found or cross-tenant access denied`);
    }
    return supplier;
  }

  public static create(
    tenantContext: TenantContext,
    dto: CreateSupplierDto,
    userPermissions: string[]
  ): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:create');
    const orgSuppliers = this.suppliersStore.filter(s => s.organizationId === tenantContext.organizationId);
    const nextNumber = orgSuppliers.length + 1;
    const formattedCode = dto.code || `FOURN-${String(nextNumber).padStart(3, '0')}`;

    const newSupplier: SupplierDto = {
      id: `sup-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      code: formattedCode,
      name: dto.name,
      companyName: dto.companyName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      taxNumber: dto.taxNumber,
      balanceDue: 0,
      paymentTerms: dto.paymentTerms || '30 NET',
      status: dto.status || 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.suppliersStore.push(newSupplier);
    return newSupplier;
  }

  public static update(
    tenantContext: TenantContext,
    id: string,
    dto: UpdateSupplierDto,
    userPermissions: string[]
  ): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:update');
    const supplier = this.findOne(tenantContext, id, userPermissions);
    const index = this.suppliersStore.findIndex(s => s.id === id && s.organizationId === tenantContext.organizationId);

    const updatedSupplier: SupplierDto = {
      ...supplier,
      ...dto,
      updatedAt: new Date().toISOString()
    };

    this.suppliersStore[index] = updatedSupplier;
    return updatedSupplier;
  }

  public static toggleStatus(
    tenantContext: TenantContext,
    id: string,
    status?: SupplierStatus,
    userPermissions: string[] = []
  ): SupplierDto {
    if (userPermissions.length > 0) {
      RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:delete');
    }
    const supplier = this.findOne(tenantContext, id, userPermissions.length > 0 ? userPermissions : ['nexus:suppliers:read']);
    const index = this.suppliersStore.findIndex(s => s.id === id && s.organizationId === tenantContext.organizationId);

    const newStatus: SupplierStatus = status || (supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');

    const updatedSupplier: SupplierDto = {
      ...supplier,
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    this.suppliersStore[index] = updatedSupplier;
    return updatedSupplier;
  }
}
