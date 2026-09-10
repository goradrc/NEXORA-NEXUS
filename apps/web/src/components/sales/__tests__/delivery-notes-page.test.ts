import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import Page from '../../../app/(dashboard)/sales/delivery-notes/page';
import { usePermissions } from '../../../hooks/usePermissions';
import { ApiClient } from '../../../services/api-client';

jest.mock('../../../hooks/usePermissions');
jest.mock('../../../services/api-client');
jest.mock('../../../offline/db', () => ({ localDb: { customers: [], products: [] } }));
jest.mock('../../ui/PermissionGuard', () => ({ PermissionGuard: ({ children }: any) => children }));
jest.mock('../DeliveryNoteModal', () => ({ DeliveryNoteModal: () => null }));

const note = (id: number, status = 'DRAFT') => ({ id: String(id), deliveryNumber: 'BL-' + id, customerId: 'c', status, lineItems: [] });
let view: ReactTestRenderer;
const buttons = (label: string) => view.root.findAllByType('button').filter(b => b.children.join('').includes(label));
const button = (label: string) => buttons(label)[0];
const mount = async () => { await act(async () => { view = create(React.createElement(Page)); }); };
const click = async (label: string) => { await act(async () => { await button(label).props.onClick(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  (usePermissions as jest.Mock).mockReturnValue(true);
  (ApiClient.request as jest.Mock).mockResolvedValue({ data: [note(1)], status: 200 });
});
afterEach(() => { if (view) act(() => view.unmount()); });

it.each([
  ['create', true, false], ['update', false, true], ['write', false, false], ['read', false, false],
])('separates %s permission from the other editing rights', async (permission, createAllowed, updateAllowed) => {
  (usePermissions as jest.Mock).mockImplementation(p => p === 'nexus:delivery-notes:read' || p === 'nexus:delivery-notes:' + permission);
  await mount();
  expect(buttons('Nouveau').length > 0).toBe(createAllowed);
  expect(buttons('Éditer').length > 0).toBe(updateAllowed);
});

it.each(['DRAFT', 'SHIPPED', 'DELIVERED', 'CANCELLED'])('only offers delivery after shipment: %s', async status => {
  (ApiClient.request as jest.Mock).mockResolvedValue({ data: [note(1, status)], status: 200 });
  await mount();
  expect(buttons('Livrer')).toHaveLength(status === 'SHIPPED' ? 1 : 0);
  expect(buttons('Expédier')).toHaveLength(status === 'DRAFT' ? 1 : 0);
});

it('loads the next 100 records and navigates back through the real API client', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => note(i)), status: 200 })
    .mockResolvedValueOnce({ data: [note(100)], status: 200 })
    .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => note(i)), status: 200 });
  await mount();
  expect(button('Précédent').props.disabled).toBe(true);
  await click('Suivant');
  expect(ApiClient.request).toHaveBeenLastCalledWith('/nexus/delivery-notes?offset=100');
  expect(view.root.findAllByType('code').filter(n => n.children.join('') === 'BL-100')).toHaveLength(1);
  expect(button('Suivant').props.disabled).toBe(true);
  await click('Précédent');
  expect(ApiClient.request).toHaveBeenLastCalledWith('/nexus/delivery-notes');
  expect(button('Précédent').props.disabled).toBe(true);
});

it('keeps the current page on failure and retries the same offset', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => note(i)), status: 200 })
    .mockResolvedValueOnce({ error: 'Network failure', status: 503 })
    .mockResolvedValueOnce({ data: [], status: 200 });
  await mount();
  await click('Suivant');
  expect(view.root.findAllByType('code').filter(n => n.children.join('') === 'BL-0')).toHaveLength(1);
  expect(button('Précédent').props.disabled).toBe(true);
  await click('Suivant');
  expect(ApiClient.request).toHaveBeenLastCalledWith('/nexus/delivery-notes?offset=100');
  expect(button('Suivant').props.disabled).toBe(true);
  expect(button('Précédent').props.disabled).toBe(false);
});

it('blocks duplicate pagination requests until completion and unlocks after a rejection', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => note(i)), status: 200 });
  await mount();
  let reject!: (reason: Error) => void;
  (ApiClient.request as jest.Mock).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const next = button('Suivant').props.onClick;
  let pending: Promise<void>;
  act(() => { pending = next(); void next(); });
  expect(ApiClient.request).toHaveBeenCalledTimes(2);
  expect(button('Suivant').props.disabled).toBe(true);
  await act(async () => { reject(new Error('offline')); await pending; });
  expect(button('Suivant').props.disabled).toBe(false);
});
