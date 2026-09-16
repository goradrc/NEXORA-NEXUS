jest.mock('../invoices.module.css', () => ({}));
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import Page from '../../../app/(dashboard)/sales/invoices/page';
import { InvoiceModal } from '../InvoiceModal';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAuth } from '../../../context/AuthContext';
import { ApiClient } from '../../../services/api-client';
jest.mock('../../../hooks/usePermissions');
jest.mock('../../../context/AuthContext');
jest.mock('../../../services/api-client');
jest.mock('../InvoiceModal', () => ({ InvoiceModal: () => null }));
const invoice = (id = '1', status = 'DRAFT') => ({
  id, invoiceNumber: 'FAC-' + id, customerId: 'customer', status, organizationId: 'org',
  totalAmount: 120, amountPaid: 0, amountDue: 120, dueDate: '2026-10-01', lineItems: [],
});
let view: ReactTestRenderer;
const buttons = (label: string) => view.root.findAllByType('button').filter(b => b.children.join('') === label);
const button = (label: string) => buttons(label)[0];
const mount = async () => { await act(async () => { view = create(React.createElement(Page)); }); };
const click = async (label: string) => { await act(async () => { await button(label).props.onClick(); }); };
beforeEach(() => {
  jest.clearAllMocks();
  (usePermissions as jest.Mock).mockReturnValue(true);
  (useAuth as jest.Mock).mockReturnValue({ user: { userId: 'user', organizationId: 'org' }, token: 'token' });
  (ApiClient.request as jest.Mock).mockResolvedValue({ status: 200, data: [invoice()] });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: jest.fn(() => true) } });
});
afterEach(() => { if (view) act(() => view.unmount()); });
it('does not request invoices without read access', async () => {
  (usePermissions as jest.Mock).mockReturnValue(false); await mount();
  expect(ApiClient.request).not.toHaveBeenCalled();
});
it.each(['read', 'create', 'update', 'manage', 'write'])('uses the exact %s permission', async right => {
  (usePermissions as jest.Mock).mockImplementation(p => p === 'nexus:invoices:read' || p === 'nexus:invoices:' + right);
  await mount();
  expect(buttons('Nouveau brouillon')).toHaveLength(right === 'create' ? 1 : 0);
  expect(buttons('Modifier')).toHaveLength(right === 'update' ? 1 : 0);
  expect(buttons('Émettre')).toHaveLength(right === 'manage' ? 1 : 0);
});
it.each(['DRAFT', 'UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'])('limits transitions for %s', async status => {
  (ApiClient.request as jest.Mock).mockResolvedValue({ status: 200, data: [invoice('1', status)] }); await mount();
  expect(buttons('Modifier')).toHaveLength(status === 'DRAFT' ? 1 : 0);
  expect(buttons('Émettre')).toHaveLength(status === 'DRAFT' ? 1 : 0);
  expect(buttons('Annuler')).toHaveLength(['PAID', 'CANCELLED'].includes(status) ? 0 : 1);
  expect(buttons('Encaisser')).toHaveLength(0);
});
it('paginates by 100 and preserves the current page on failure', async () => {
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ status: 200, data: Array.from({ length: 100 }, (_, i) => invoice(String(i))) })
    .mockResolvedValueOnce({ status: 503, error: 'Indisponible' }).mockResolvedValueOnce({ status: 200, data: [] });
  await mount(); await click('Suivant');
  expect(ApiClient.request).toHaveBeenLastCalledWith('/nexus/invoices?offset=100');
  expect(button('Précédent').props.disabled).toBe(true);
  await click('Suivant'); expect(button('Précédent').props.disabled).toBe(false);
});
it('retains the issue key after a lost response and prevents double submission', async () => {
  await mount();
  let resolve!: (value: any) => void;
  (ApiClient.request as jest.Mock).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const issue = button('Émettre').props.onClick;
  let pending: Promise<void>;
  act(() => { pending = issue(); void issue(); });
  expect(ApiClient.request).toHaveBeenCalledTimes(2);
  const first = (ApiClient.request as jest.Mock).mock.calls[1];
  await act(async () => { resolve({ status: 0, error: 'Connexion perdue' }); await pending; });
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ status: 200, data: invoice('1', 'UNPAID') });
  await click('Émettre');
  expect((ApiClient.request as jest.Mock).mock.calls[2]).toEqual(first);
  expect(first[0]).toBe('/nexus/invoices/1/issue');
  expect(first[1].headers['idempotency-key']).toBeTruthy();
});
it('sends only the draft payload and keeps the modal open on failure', async () => {
  await mount(); await click('Nouveau brouillon');
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ status: 400, error: 'Customer not found' });
  const data = { customerId: 'customer', dueDate: '2026-10-01', lineItems: [{ productServiceId: 'p', description: 'Article', quantity: 1, unitPrice: 100 }] };
  await act(async () => { expect(await view.root.findByType(InvoiceModal).props.onSave(data, 'retry-key')).toBe(false); });
  expect(ApiClient.request).toHaveBeenLastCalledWith('/nexus/invoices', { method: 'POST', body: { ...data, idempotencyKey: 'retry-key' } });
  expect(view.root.findByType(InvoiceModal).props.isOpen).toBe(true);
});
it('discards an old session response after organization change', async () => {
  let resolve!: (value: any) => void;
  (ApiClient.request as jest.Mock).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await mount();
  (useAuth as jest.Mock).mockReturnValue({ user: { userId: 'user', organizationId: 'other' }, token: 'new-token' });
  (ApiClient.request as jest.Mock).mockResolvedValueOnce({ status: 200, data: [invoice('new')] });
  await act(async () => { view.update(React.createElement(Page)); });
  await act(async () => { resolve({ status: 200, data: [invoice('old')] }); });
  expect(view.root.findAllByType('code').map(n => n.children.join(''))).toEqual(['FAC-new']);
});
