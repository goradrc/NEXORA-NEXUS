'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiClient } from '../services/api-client';

export interface UserSession {
  userId: string;
  email: string;
  organizationId: string;
  permissions: string[];
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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  switchOrganization: (orgId: string) => void;
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

  const login = async (email: string, password: string): Promise<boolean> => {
    const res = await ApiClient.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    if (res.data && res.data.accessToken) {
      const accessToken = res.data.accessToken;
      setToken(accessToken);
      ApiClient.setAuthToken(accessToken);

      const session: UserSession = {
        userId: res.data.user.userId || 'usr-123',
        email: res.data.user.email || email,
        organizationId: activeOrganization?.id || 'org-1',
        permissions: [
          'nexus:catalog:read', 'nexus:catalog:create',
          'nexus:stock:read', 'nexus:stock:create',
          'nexus:expenses:read', 'nexus:expenses:create',
          'nexus:employees:read', 'nexus:employees:create',
          'nexus:quotes:read', 'nexus:quotes:create',
          'nexus:invoices:read', 'nexus:invoices:create',
          'nexus:payments:read', 'nexus:payments:create',
        ],
      };
      setUser(session);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    ApiClient.setAuthToken(null);
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
        login,
        logout,
        switchOrganization,
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
