import { TenantContext, RolesGuard } from '@nexora/core';
import { SupplierDto, CreateSupplierDto, UpdateSupplierDto } from '@nexora/nexus';

export class SuppliersService {
  private static suppliersStore: SupplierDto[] = [
    {
      id: 'sup-001',
      organizationId: 'org-1',
      code: 'FOURN-001',
      name: 'Supplier Industrial Ltd',
      companyName: 'Industrial Hardware',
      contactName: 'John Doe',
      email: 'sales@industrial.com',
      phone: '+33 1 40 00 00 00',
      address: '10 Rue de la Logistique, Paris',
      status: 'ACTIVE',
      balanceDue: 2500,
      paymentTerms: '30 NET',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): SupplierDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:read');
    return this.suppliersStore.filter((s) => s.organizationId === tenantContext.organizationId);
  }

  public static findOne(
    tenantContext: TenantContext,
    supplierId: string,
    userPermissions: string[]
  ): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:read');
    const supplier = this.suppliersStore.find(
      (s) => s.id === supplierId && s.organizationId === tenantContext.organizationId
    );
    if (!supplier) {
      throw new Error(`SUPPLIER_NOT_FOUND: Supplier ${supplierId} not found or cross-tenant access denied`);
    }
    return supplier;
  }

  public static create(
    tenantContext: TenantContext,
    dto: CreateSupplierDto,
    userPermissions: string[]
  ): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:write');
    const orgId = tenantContext.organizationId;

    if (!dto.name || !dto.name.trim()) {
      throw new Error('INVALID_SUPPLIER_NAME: Supplier name is required');
    }

    if (dto.email && !dto.email.includes('@')) {
      throw new Error('INVALID_EMAIL_FORMAT: Provided supplier email format is invalid');
    }

    const orgCount = this.suppliersStore.filter((s) => s.organizationId === orgId).length;
    const code = dto.code || `FOURN-${(orgCount + 1).toString().padStart(3, '0')}`;

    const newSupplier: SupplierDto = {
      id: `sup-${crypto.randomUUID()}`,
      organizationId: orgId,
      code,
      name: dto.name.trim(),
      companyName: dto.companyName?.trim(),
      contactName: dto.contactName?.trim(),
      email: dto.email?.trim(),
      phone: dto.phone?.trim(),
      address: dto.address?.trim(),
      taxNumber: dto.taxNumber?.trim(),
      notes: dto.notes?.trim(),
      status: 'ACTIVE',
      balanceDue: 0,
      paymentTerms: dto.paymentTerms || '30 NET',
      createdBy: tenantContext.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.suppliersStore.push(newSupplier);
    return newSupplier;
  }

  public static update(
    tenantContext: TenantContext,
    supplierId: string,
    dto: UpdateSupplierDto,
    userPermissions: string[]
  ): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:write');
    const existing = this.findOne(tenantContext, supplierId, userPermissions);

    if (dto.name !== undefined && (!dto.name || !dto.name.trim())) {
      throw new Error('INVALID_SUPPLIER_NAME: Supplier name cannot be empty');
    }

    if (dto.email && !dto.email.includes('@')) {
      throw new Error('INVALID_EMAIL_FORMAT: Provided supplier email format is invalid');
    }

    const updated: SupplierDto = {
      ...existing,
      name: dto.name !== undefined ? dto.name.trim() : existing.name,
      companyName: dto.companyName !== undefined ? dto.companyName.trim() : existing.companyName,
      contactName: dto.contactName !== undefined ? dto.contactName.trim() : existing.contactName,
      email: dto.email !== undefined ? dto.email.trim() : existing.email,
      phone: dto.phone !== undefined ? dto.phone.trim() : existing.phone,
      address: dto.address !== undefined ? dto.address.trim() : existing.address,
      taxNumber: dto.taxNumber !== undefined ? dto.taxNumber.trim() : existing.taxNumber,
      notes: dto.notes !== undefined ? dto.notes.trim() : existing.notes,
      status: dto.status || existing.status,
      paymentTerms: dto.paymentTerms || existing.paymentTerms,
      updatedAt: new Date().toISOString(),
    };

    const idx = this.suppliersStore.findIndex(
      (s) => s.id === supplierId && s.organizationId === tenantContext.organizationId
    );
    this.suppliersStore[idx] = updated;
    return updated;
  }

  public static toggleStatus(
    tenantContext: TenantContext,
    supplierId: string,
    userPermissions: string[]
  ): SupplierDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:suppliers:write');
    const existing = this.findOne(tenantContext, supplierId, userPermissions);

    const newStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    return this.update(tenantContext, supplierId, { status: newStatus }, userPermissions);
  }

  public static clearAllForTesting(): void {
    this.suppliersStore = [];
  }
}
