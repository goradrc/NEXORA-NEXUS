'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiClient } from '../services/api-client';

export type ModuleType = 'NEXUS' | 'VITALIS';

export interface UserSession {
  userId: string;
  email: string;
  organizationId: string;
  permissions: string[];
  defaultModule?: ModuleType;
  activeModule?: ModuleType;
}

export interface OrganizationInfo {
  id: string;
  name: string;
}

export interface AuthContextType {
  user: UserSession | null;
  activeOrganization: OrganizationInfo | null;
  organizations: OrganizationInfo[];
  token: string | null;
  isAuthenticated: boolean;
  activeModule: ModuleType | null;
  login: (email: string, password: string) => Promise<{ success: boolean; defaultModule?: ModuleType }>;
  logout: () => void;
  switchOrganization: (orgId: string) => void;
  selectModule: (module: ModuleType, saveAsDefault?: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([
    { id: 'org-1', name: 'NEXORA HQ (France)' },
    { id: 'org-2', name: 'NEXORA Global Services' },
  ]);
  const [activeOrganization, setActiveOrganization] = useState<OrganizationInfo | null>({
    id: 'org-1',
    name: 'NEXORA HQ (France)',
  });
  const [activeModule, setActiveModule] = useState<ModuleType | null>(null);

  // Restore saved session & module preference from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('nexora_token');
      const savedDefault = localStorage.getItem('nexora_default_module') as ModuleType | null;
      if (savedDefault) {
        setActiveModule(savedDefault);
      }
      if (storedToken) {
        setToken(storedToken);
        ApiClient.setAuthToken(storedToken);
        setUser({
          userId: 'usr-admin-123',
          email: 'admin@nexora.io',
          organizationId: 'org-1',
          permissions: [
            'nexus:catalog:read', 'nexus:catalog:create',
            'nexus:stock:read', 'nexus:stock:create',
            'nexus:expenses:read', 'nexus:expenses:create',
            'nexus:employees:read', 'nexus:employees:create',
            'nexus:quotes:read', 'nexus:quotes:create',
            'nexus:invoices:read', 'nexus:invoices:create',
            'nexus:payments:read', 'nexus:payments:create',
            'nexus:customers:read', 'nexus:customers:create',
            'nexus:customers:update', 'nexus:customers:delete',
            'nexus:suppliers:read', 'nexus:suppliers:create',
            'nexus:suppliers:update', 'nexus:suppliers:delete',
          ],
          defaultModule: savedDefault || 'NEXUS',
          activeModule: savedDefault || 'NEXUS',
        });
      }
    }
  }, []);

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; defaultModule?: ModuleType }> => {
    const res = await ApiClient.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    if ((res.data && res.data.accessToken) || res.status === 0) {
      const accessToken = res.data?.accessToken || 'demo-offline-access-token';
      setToken(accessToken);
      ApiClient.setAuthToken(accessToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('nexora_token', accessToken);
      }

      // First priority: Backend account defaultModule returned from database / JWT
      let savedDefaultModule: ModuleType | undefined = res.data.user?.defaultModule;

      // Second priority (Offline fallback): Local storage cache
      if (!savedDefaultModule && typeof window !== 'undefined') {
        const stored = localStorage.getItem(`nexora_default_module_${res.data.user?.userId || email}`);
        if (stored === 'NEXUS' || stored === 'VITALIS') {
          savedDefaultModule = stored as ModuleType;
        }
      }

      const sessionModule = savedDefaultModule || activeModule || undefined;

      const session: UserSession = {
        userId: res.data.user?.userId || 'usr-123',
        email: res.data.user?.email || email,
        organizationId: activeOrganization?.id || 'org-1',
        permissions: [
          'nexus:catalog:read', 'nexus:catalog:create',
          'nexus:stock:read', 'nexus:stock:create',
          'nexus:expenses:read', 'nexus:expenses:create',
          'nexus:employees:read', 'nexus:employees:create',
          'nexus:quotes:read', 'nexus:quotes:create',
          'nexus:invoices:read', 'nexus:invoices:create',
          'nexus:payments:read', 'nexus:payments:create',
          'nexus:customers:read', 'nexus:customers:create',
          'nexus:customers:update', 'nexus:customers:delete',
          'nexus:suppliers:read', 'nexus:suppliers:create',
          'nexus:suppliers:update', 'nexus:suppliers:delete',
        ],
        defaultModule: savedDefaultModule,
        activeModule: sessionModule,
      };

      setUser(session);
      if (sessionModule) {
        setActiveModule(sessionModule);
      }

      return { success: true, defaultModule: savedDefaultModule };
    }
    return { success: false };
  };

  const selectModule = async (module: ModuleType, saveAsDefault: boolean = false) => {
    if (!user) {
      setActiveModule(module);
      return;
    }

    if (saveAsDefault) {
      const res = await ApiClient.request('/auth/user/default-module', {
        method: 'POST',
        body: { defaultModule: module },
      });

      if (res.status >= 400 || (res.data && res.data.error) || res.error) {
        const errorMessage = res.error || res.data?.message || 'Failed to persist default module on server';
        console.error('Failed to persist default module on server:', errorMessage);
        throw new Error(errorMessage);
      }

      if (res.data && res.data.tokens?.accessToken) {
        const newToken = res.data.tokens.accessToken;
        setToken(newToken);
        ApiClient.setAuthToken(newToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem('nexora_token', newToken);
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(`nexora_default_module_${user.userId}`, module);
        localStorage.setItem('nexora_default_module', module);
      }
    }

    setActiveModule(module);
    setUser({
      ...user,
      activeModule: module,
      defaultModule: saveAsDefault ? module : user.defaultModule,
    });
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setActiveModule(null);
    ApiClient.setAuthToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nexora_token');
    }
  };

  const switchOrganization = (orgId: string) => {
    const target = organizations.find(o => o.id === orgId);
    if (target) {
      setActiveOrganization(target);
      if (user) {
        setUser({ ...user, organizationId: target.id });
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrganization,
        organizations,
        token,
        isAuthenticated: !!user,
        activeModule,
        login,
        logout,
        switchOrganization,
        selectModule,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
