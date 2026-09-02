import { TenantMiddleware, TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';

export class CompanyService {
  private static mockCompanies: Map<string, any> = new Map([
    ['org-1', { id: 'org-1', name: 'Nexora Inc', currency: 'EUR', timezone: 'UTC', email: 'contact@nexora.io' }],
    ['org-2', { id: 'org-2', name: 'Acme Corp', currency: 'USD', timezone: 'America/New_York', email: 'admin@acme.com' }]
  ]);

  public static getProfile(tenantContext: TenantContext) {
    const orgId = tenantContext.organizationId;
    const company = this.mockCompanies.get(orgId);
    if (!company) {
      throw new Error(`COMPANY_NOT_FOUND: Organization profile for ${orgId} not found`);
    }
    return company;
  }

  public static updateProfile(tenantContext: TenantContext, updateData: any, userPermissions: string[]) {
    RolesGuard.enforcePermission(userPermissions, 'nexus:company:update');
    const orgId = tenantContext.organizationId;
    const existing = this.getProfile(tenantContext);
    const updated = { ...existing, ...updateData, id: orgId };
    this.mockCompanies.set(orgId, updated);
    return updated;
  }
}
