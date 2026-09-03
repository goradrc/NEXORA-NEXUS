import { TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';
import { SupplierDto, CreateSupplierDto, UpdateSupplierDto } from '@nexora/nexus';

export class SuppliersService {
  private static suppliersStore: SupplierDto[] = [
    {
      id: 'sup-001',
      organizationId: 'org-1',
      code: 'FOURN-001',
      name: 'Supplier Industrial Ltd',
      companyName: 'Industrial Hardware',
      email: 'sales@industrial.com',
      payableBalance: 2500,
      balanceDue: 2500,
      paymentTerms: '30 NET',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): SupplierDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:read');
    return this.suppliersStore.filter(s => s.organizationId === tenantContext.organizationId);
  }

  public static create(tenantContext: TenantContext, dto: CreateSupplierDto, userPermissions: string[]): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:create');
    const newSupplier: SupplierDto = {
      id: `sup-${Date.now()}`,
      organizationId: tenantContext.organizationId,
      code: dto.code || `FOURN-00${this.suppliersStore.length + 1}`,
      name: dto.name,
      companyName: dto.companyName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      taxNumber: dto.taxNumber,
      payableBalance: dto.payableBalance || 0,
      balanceDue: 0,
      paymentTerms: dto.paymentTerms || '30 NET',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.suppliersStore.push(newSupplier);
    return newSupplier;
  }
}
