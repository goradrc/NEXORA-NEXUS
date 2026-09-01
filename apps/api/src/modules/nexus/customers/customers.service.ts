import { TenantMiddleware, TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';
import { CustomerDto, CreateCustomerDto, UpdateCustomerDto } from '@nexora/nexus';

export class CustomersService {
  private static customersStore: CustomerDto[] = [
    {
      id: 'cli-001',
      organizationId: 'org-1',
      code: 'CLI-001',
      name: 'Client Alpha',
      companyName: 'Alpha Tech',
      email: 'alpha@client.com',
      balance: 1500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'cli-002',
      organizationId: 'org-2',
      code: 'CLI-001',
      name: 'Beta Global',
      email: 'beta@global.com',
      balance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): CustomerDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:customers:read');
    return this.customersStore.filter(c => c.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, customerId: string, userPermissions: string[]): CustomerDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:customers:read');
    const customer = this.customersStore.find(
      c => c.id === customerId && c.organizationId === tenantContext.organizationId
    );
    if (!customer) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer ${customerId} not found or cross-tenant access denied`);
    }
    return customer;
  }

  public static create(tenantContext: TenantContext, dto: CreateCustomerDto, userPermissions: string[]): CustomerDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:customers:create');
    const nextCode = dto.code || `CLI-00${this.customersStore.length + 1}`;
    const newCustomer: CustomerDto = {
      id: `cli-${Date.now()}`,
      organizationId: tenantContext.organizationId,
      code: nextCode,
      name: dto.name,
      companyName: dto.companyName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      taxNumber: dto.taxNumber,
      balance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.customersStore.push(newCustomer);
    return newCustomer;
  }

  public static update(
    tenantContext: TenantContext,
    customerId: string,
    dto: UpdateCustomerDto,
    userPermissions: string[]
  ): CustomerDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:customers:update');
    const existing = this.findOne(tenantContext, customerId, userPermissions);
    const updated = {
      ...existing,
      ...dto,
      updatedAt: new Date().toISOString()
    };
    const index = this.customersStore.findIndex(c => c.id === customerId && c.organizationId === tenantContext.organizationId);
    this.customersStore[index] = updated;
    return updated;
  }

  public static delete(tenantContext: TenantContext, customerId: string, userPermissions: string[]): boolean {
    RolesGuard.enforcePermission(userPermissions, 'nexus:customers:delete');
    this.findOne(tenantContext, customerId, userPermissions);
    this.customersStore = this.customersStore.filter(
      c => !(c.id === customerId && c.organizationId === tenantContext.organizationId)
    );
    return true;
  }
}
