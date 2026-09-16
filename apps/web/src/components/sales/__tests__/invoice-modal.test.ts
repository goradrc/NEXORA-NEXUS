beforeEach(() => { Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: null, body: { style: { overflow: '' } }, addEventListener: jest.fn(), removeEventListener: jest.fn() } }); });
jest.mock('../invoices.module.css', () => ({}));
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { InvoiceModal } from '../InvoiceModal';
jest.mock('../../ui/Modal', () => ({ Modal: ({ children }: any) => children }));
let view: ReactTestRenderer;
const initialData: any = {
  id: '1', invoiceNumber: 'FAC-1', customerId: 'c', dueDate: '2026-10-01', status: 'DRAFT',
  lineItems: [{ id: 'line', invoiceId: '1', totalPrice: 10, productServiceId: 'p', description: 'Article', quantity: 1, unitPrice: 10, taxRate: 0, discountPercent: 0 }],
};
afterEach(() => { if (view) act(() => view.unmount()); });
it('strips server-only fields and reuses the key on retry', async () => {
  const save = jest.fn().mockResolvedValue(false);
  await act(async () => { view = create(React.createElement(InvoiceModal, { isOpen: true, onClose: jest.fn(), onSave: save, initialData })); });
  const submit = () => view.root.findByType('form').props.onSubmit({ preventDefault() {} });
  await act(async () => { await submit(); }); await act(async () => { await submit(); });
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(save.mock.calls[0][0]).toEqual({ customerId: 'c', dueDate: '2026-10-01', lineItems: [{ productServiceId: 'p', description: 'Article', quantity: 1, unitPrice: 10, taxRate: 0, discountPercent: 0 }] });
  act(() => { view.root.findAllByType('input')[0].props.onChange({ target: { value: 'c2' } }); });
  await act(async () => { await submit(); });
  expect(save.mock.calls[2][1]).not.toBe(save.mock.calls[0][1]);
});
it('blocks submissions while pending and forbids editing issued invoices', async () => {
  let resolve!: (value: boolean) => void;
  const save = jest.fn(() => new Promise<boolean>(r => { resolve = r; }));
  await act(async () => { view = create(React.createElement(InvoiceModal, { isOpen: true, onClose: jest.fn(), onSave: save, initialData })); });
  const submit = view.root.findByType('form').props.onSubmit;
  let pending: Promise<void>;
  act(() => { pending = submit({ preventDefault() {} }); void submit({ preventDefault() {} }); });
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(true); await pending; });
  await act(async () => { view.update(React.createElement(InvoiceModal, { isOpen: true, onClose: jest.fn(), onSave: save, initialData: { ...initialData, status: 'UNPAID' } })); });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(save).toHaveBeenCalledTimes(1);
});
it('rejects a zero quantity before contacting the server', async () => {
  const save = jest.fn();
  await act(async () => { view = create(React.createElement(InvoiceModal, { isOpen: true, onClose: jest.fn(), onSave: save, initialData: { ...initialData, lineItems: [{ ...initialData.lineItems[0], quantity: 0 }] } })); });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(save).not.toHaveBeenCalled();
});
