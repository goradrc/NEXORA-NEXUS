export class RolesGuard {
  /**
   * Checks if a user's permissions contain the required permission code.
   */
  public static hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    // Admin override wildcard check
    if (userPermissions.includes('*') || userPermissions.includes('nexus:admin')) {
      return true;
    }
    return userPermissions.includes(requiredPermission);
  }

  /**
   * Enforces permission check or throws Unauthorized error.
   */
  public static enforcePermission(userPermissions: string[], requiredPermission: string): void {
    if (!this.hasPermission(userPermissions, requiredPermission)) {
      throw new Error(`FORBIDDEN_PERMISSION: Missing required permission [${requiredPermission}]`);
    }
  }
}
