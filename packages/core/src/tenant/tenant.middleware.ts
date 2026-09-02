export interface TenantContext {
  organizationId: string;
  userId: string;
}

export class TenantMiddleware {
  /**
   * Validates that the current request tenant context matches the target resource tenant ID.
   * Throws an error if cross-tenant data access is attempted.
   */
  public static validateTenantAccess(
    currentTenantContext: TenantContext | undefined,
    targetOrgId: string
  ): boolean {
    if (!currentTenantContext || !currentTenantContext.organizationId) {
      throw new Error('UNAUTHORIZED_TENANT_ACCESS: Missing tenant context');
    }

    if (currentTenantContext.organizationId !== targetOrgId) {
      throw new Error(
        `CROSS_TENANT_VIOLATION: Access denied to organization ${targetOrgId} from tenant ${currentTenantContext.organizationId}`
      );
    }

    return true;
  }

  /**
   * Helper to automatically inject tenant filter into database query payloads.
   */
  public static injectTenantFilter<T extends object>(
    queryPayload: T,
    tenantContext: TenantContext
  ): T & { organizationId: string } {
    return {
      ...queryPayload,
      organizationId: tenantContext.organizationId,
    };
  }
}
