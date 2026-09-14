'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ApiClient } from '../services/api-client';

export interface UserSession { userId: string; email: string; organizationId: string; permissions: string[]; }
export interface OrganizationInfo { id: string; name: string; }
interface Session { accessToken: string; user: UserSession; activeOrganization: OrganizationInfo; organizations: OrganizationInfo[]; }
export interface AuthContextType {
  user: UserSession | null; activeOrganization: OrganizationInfo | null; organizations: OrganizationInfo[];
  token: string | null; isAuthenticated: boolean; loading: boolean; error: string | null;
  login: (email: string, password: string) => Promise<boolean>; logout: () => void;
  switchOrganization: (orgId: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const apply = (value: Session | null) => {
    ApiClient.setAuthToken(value?.accessToken ?? null);
    setSession(value);
  };
  const logout = () => { generation.current++; apply(null); setLoading(false); setError(null); };
  useEffect(() => {
    setLoading(false);
    const expired = () => { logout(); };
    window.addEventListener('nexus:unauthorized', expired);
    return () => window.removeEventListener('nexus:unauthorized', expired);
  }, []);
  // Credentials stay in memory: a browser reload requires a new login.
  const login = async (email: string, password: string) => {
    const id = ++generation.current;
    apply(null); setError(null);
    const res = await ApiClient.request<Session>('/auth/login', { method: 'POST', body: { email, password } });
    if (id !== generation.current) return false;
    if (!res.data) return false;
    apply(res.data); return true;
  };
  const switchOrganization = async (organizationId: string) => {
    if (loading || organizationId === session?.activeOrganization.id) return;
    const id = ++generation.current;
    setLoading(true); setError(null);
    const res = await ApiClient.request<Session>('/auth/switch-organization', { method: 'POST', body: { organizationId } });
    if (id !== generation.current) return;
    if (res.data) apply(res.data);
    else setError('Impossible de changer d’entreprise. Votre entreprise actuelle reste sélectionnée.');
    setLoading(false);
  };
  useEffect(() => {
    if (!session || loading) return;
    const id = generation.current;
    const timer = window.setInterval(async () => {
      const res = await ApiClient.request<Session>('/auth/me');
      if (id !== generation.current) return;
      if (res.data) apply(res.data);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [session?.user.userId, session?.activeOrganization.id, loading]);
  return <AuthContext.Provider value={{ user: session?.user ?? null, token: session?.accessToken ?? null,
    activeOrganization: session?.activeOrganization ?? null, organizations: session?.organizations ?? [],
    isAuthenticated: !!session, loading, error, login, logout, switchOrganization }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
