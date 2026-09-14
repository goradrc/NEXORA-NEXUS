import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AuthProvider, useAuth, AuthContextType } from '../AuthContext';
import { ApiClient } from '../../services/api-client';

jest.mock('../../services/api-client');
let auth: AuthContextType, view: ReactTestRenderer;
const session = (id: string) => ({ accessToken: 'token-' + id, user: { userId: 'u', email: 'u@example.test', organizationId: id, permissions: ['nexus:delivery-notes:read'] }, activeOrganization: { id, name: id }, organizations: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }] });
const Probe = () => { auth = useAuth(); return null; };
beforeEach(async () => {
  jest.clearAllMocks();
  (global as any).window = { addEventListener: jest.fn(), removeEventListener: jest.fn(), setInterval: jest.fn(), clearInterval: jest.fn() };
  await act(async () => { view = create(React.createElement(AuthProvider, null, React.createElement(Probe))); });
});
afterEach(() => { act(() => view.unmount()); delete (global as any).window; });
it('starts unauthenticated without fictional organizations or permissions', () => {
  expect(auth.isAuthenticated).toBe(false); expect(auth.organizations).toEqual([]); expect(auth.user).toBeNull();
});
it('uses the API session and clears it on logout', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValue({ status: 201, data: session('a') });
  await act(async () => { expect(await auth.login('u@example.test', 'password')).toBe(true); });
  expect(auth.user?.permissions).toEqual(['nexus:delivery-notes:read']);
  expect(ApiClient.setAuthToken).toHaveBeenLastCalledWith('token-a');
  act(() => auth.logout()); expect(auth.user).toBeNull(); expect(ApiClient.setAuthToken).toHaveBeenLastCalledWith(null);
});
it('waits for the server before switching and discards a response received after logout', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValue({ status: 201, data: session('a') });
  await act(async () => { await auth.login('u', 'p'); });
  let resolve: any;
  (ApiClient.request as jest.Mock).mockImplementation(() => new Promise(r => { resolve = r; }));
  let pending: Promise<void>;
  act(() => { pending = auth.switchOrganization('b'); });
  expect(auth.loading).toBe(true); expect(auth.activeOrganization?.id).toBe('a');
  act(() => auth.logout());
  await act(async () => { resolve({ status: 201, data: session('b') }); await pending; });
  expect(auth.isAuthenticated).toBe(false); expect(ApiClient.setAuthToken).toHaveBeenLastCalledWith(null);
});
it('changes organization and token together, and preserves the old session on network failure', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValue({ data: session('a') });
  await act(async () => { await auth.login('u', 'p'); });
  (ApiClient.request as jest.Mock).mockResolvedValue({ data: session('b') });
  await act(async () => { await auth.switchOrganization('b'); });
  expect(auth.activeOrganization?.id).toBe('b'); expect(ApiClient.setAuthToken).toHaveBeenLastCalledWith('token-b');
  (ApiClient.request as jest.Mock).mockResolvedValue({ status: 0, error: 'offline' });
  await act(async () => { await auth.switchOrganization('a'); });
  expect(auth.activeOrganization?.id).toBe('b'); expect(auth.error).toBeTruthy();
});
it('resumes session checks after a failed organization switch', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValue({ data: session('a') });
  await act(async () => { await auth.login('u', 'p'); });
  const oldCheck = (window.setInterval as jest.Mock).mock.calls.at(-1)[0];
  (ApiClient.request as jest.Mock).mockResolvedValue({ status: 0, error: 'offline' });
  await act(async () => { await auth.switchOrganization('b'); });
  const resumedCheck = (window.setInterval as jest.Mock).mock.calls.at(-1)[0];
  expect(resumedCheck).not.toBe(oldCheck);
  const updated = session('a');
  updated.user.permissions = [];
  (ApiClient.request as jest.Mock).mockResolvedValue({ data: updated });
  await act(async () => { await resumedCheck(); });
  expect(ApiClient.request).toHaveBeenLastCalledWith('/auth/me');
  expect(auth.user?.permissions).toEqual([]);
});
