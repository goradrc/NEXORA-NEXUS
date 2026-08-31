import { AuthService } from '../src/auth/auth.service';
import { TenantMiddleware } from '../src/tenant/tenant.middleware';
import { RolesGuard } from '../src/security/roles.guard';
import { AuditService } from '../src/audit/audit.service';

describe('NEXORA CORE Engine Test Suite', () => {

  describe('1. Authentication & JWT Module', () => {
    it('should hash password and verify correctly', () => {
      const password = 'SecurePassword123!';
      const hash = AuthService.hashPassword(password);
      expect(hash).not.toEqual(password);
      expect(AuthService.verifyPassword(password, hash)).toBe(true);
      expect(AuthService.verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('should generate valid JWT access & refresh tokens', () => {
      const payload = {
        userId: 'usr-123-uuid',
        email: 'admin@nexora.io',
        organizationId: 'org-456-uuid'
      };
      const tokens = AuthService.generateTokens(payload);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      const decoded = AuthService.verifyToken(tokens.accessToken);
      expect(decoded.userId).toEqual(payload.userId);
      expect(decoded.organizationId).toEqual(payload.organizationId);
    });

    it('should reject invalid or tampered JWT token', () => {
      const payload = { userId: 'usr-123', email: 'user@nexora.io' };
      const tokens = AuthService.generateTokens(payload);
      const tamperedToken = tokens.accessToken + 'tampered';

      expect(() => AuthService.verifyToken(tamperedToken)).toThrow('Invalid token signature');
    });
  });

  describe('2. Strict Multi-Tenant Isolation Module', () => {
    const tenantA = { organizationId: 'org-tenant-A', userId: 'usr-1' };
    const tenantB = { organizationId: 'org-tenant-B', userId: 'usr-2' };

    it('should allow access when tenant context matches resource tenant ID', () => {
      expect(TenantMiddleware.validateTenantAccess(tenantA, 'org-tenant-A')).toBe(true);
    });

    it('should throw CROSS_TENANT_VIOLATION error when accessing another tenant data', () => {
      expect(() => {
        TenantMiddleware.validateTenantAccess(tenantA, 'org-tenant-B');
      }).toThrow('CROSS_TENANT_VIOLATION');
    });

    it('should inject tenant ID into query payload automatically', () => {
      const rawQuery = { name: 'Customer Inc' };
      const isolatedQuery = TenantMiddleware.injectTenantFilter(rawQuery, tenantA);

      expect(isolatedQuery).toEqual({
        name: 'Customer Inc',
        organizationId: 'org-tenant-A'
      });
    });
  });

  describe('3. Security & RBAC Guard Module', () => {
    const userPermissions = ['nexus:invoices:read', 'nexus:invoices:create'];

    it('should allow action when user possesses permission', () => {
      expect(RolesGuard.hasPermission(userPermissions, 'nexus:invoices:create')).toBe(true);
      expect(() => RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:create')).not.toThrow();
    });

    it('should deny action when user lacks required permission', () => {
      expect(RolesGuard.hasPermission(userPermissions, 'nexus:invoices:delete')).toBe(false);
      expect(() => RolesGuard.enforcePermission(userPermissions, 'nexus:invoices:delete')).toThrow(
        'FORBIDDEN_PERMISSION'
      );
    });

    it('should allow all actions for admin wildcard permission', () => {
      const adminPermissions = ['nexus:admin'];
      expect(RolesGuard.hasPermission(adminPermissions, 'nexus:any:action')).toBe(true);
    });
  });

  describe('4. Audit Trail Module', () => {
    it('should log audit events and filter by tenant', () => {
      AuditService.log({
        organizationId: 'org-tenant-A',
        userId: 'usr-1',
        action: 'CREATE',
        entityName: 'Invoice',
        entityId: 'fac-001'
      });

      AuditService.log({
        organizationId: 'org-tenant-B',
        userId: 'usr-2',
        action: 'DELETE',
        entityName: 'Customer',
        entityId: 'cli-002'
      });

      const logsA = AuditService.getLogs('org-tenant-A');
      expect(logsA).toHaveLength(1);
      expect(logsA[0].entityId).toEqual('fac-001');

      const logsB = AuditService.getLogs('org-tenant-B');
      expect(logsB).toHaveLength(1);
      expect(logsB[0].entityId).toEqual('cli-002');
    });
  });

});
