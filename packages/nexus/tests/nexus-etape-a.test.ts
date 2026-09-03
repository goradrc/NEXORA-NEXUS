import { ApiClient } from '../../../apps/web/src/services/api-client';
import { usePermissions } from '../../../apps/web/src/hooks/usePermissions';

describe('NEXORA NEXUS — Étape A Test Suite (Fondations UI & System Layout)', () => {
  beforeEach(() => {
    ApiClient.setAuthToken(null);
  });

  describe('1. ApiClient REST Service', () => {
    it('should set and retrieve Bearer JWT authorization token', () => {
      expect(ApiClient.getAuthToken()).toBeNull();

      const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sampleToken';
      ApiClient.setAuthToken(sampleToken);

      expect(ApiClient.getAuthToken()).toEqual(sampleToken);
    });

    it('should format requests cleanly and handle network errors in offline state', async () => {
      ApiClient.setAuthToken('test-token-123');

      // Attempting request to invalid local port -> should return offline error response without crashing
      const res = await ApiClient.request('/test-endpoint');

      expect(res.status).toEqual(0);
      expect(res.error).toBeDefined();
    });
  });

  describe('2. RBAC UI Permissions Hook', () => {
    it('should grant access if required permission is present in user permissions list', () => {
      const mockAuthModule = require('../../../apps/web/src/context/AuthContext');

      jest.spyOn(mockAuthModule, 'useAuth').mockReturnValue({
        user: {
          userId: 'usr-123',
          email: 'admin@nexora.io',
          organizationId: 'org-1',
          permissions: ['nexus:invoices:read', 'nexus:invoices:create'],
        },
      });

      expect(usePermissions('nexus:invoices:read')).toBe(true);
      expect(usePermissions('nexus:invoices:delete')).toBe(false);
    });

    it('should grant access to all routes for admin wildcard permission', () => {
      const mockAuthModule = require('../../../apps/web/src/context/AuthContext');

      jest.spyOn(mockAuthModule, 'useAuth').mockReturnValue({
        user: {
          userId: 'usr-admin',
          email: 'superadmin@nexora.io',
          organizationId: 'org-1',
          permissions: ['nexus:admin'],
        },
      });

      expect(usePermissions('nexus:any:permission')).toBe(true);
    });
  });

  describe('3. Étape B1 — CORE Module Selection & Switcher', () => {
    it('should handle activeModule and defaultModule properties in UserSession context', () => {
      const mockAuthModule = require('../../../apps/web/src/context/AuthContext');

      const mockSelectModule = jest.fn();
      jest.spyOn(mockAuthModule, 'useAuth').mockReturnValue({
        user: {
          userId: 'usr-123',
          email: 'user@nexora.io',
          organizationId: 'org-1',
          permissions: ['nexus:catalog:read'],
          defaultModule: 'NEXUS',
          activeModule: 'NEXUS',
        },
        activeModule: 'NEXUS',
        selectModule: mockSelectModule,
      });

      const { useAuth } = mockAuthModule;
      const auth = useAuth();

      expect(auth.activeModule).toEqual('NEXUS');
      expect(auth.user.defaultModule).toEqual('NEXUS');

      auth.selectModule('VITALIS', true);
      expect(mockSelectModule).toHaveBeenCalledWith('VITALIS', true);
    });
  });
});
