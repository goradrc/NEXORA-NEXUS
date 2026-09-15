import { InvoicesService } from '../src/modules/nexus/invoices/invoices.service';

describe('InvoicesService unit tests', () => {
  const contextA = { organizationId: 'org-a', userId: 'user-a' };
  const contextB = { organizationId: 'org-b', userId: 'user-b' };

  let membershipA: any;
  let txA: any;
  let service: InvoicesService;

  beforeEach(() => {
    membershipA = {
      status: 'ACTIVE',
      user: { isActive: true },
      role: {
        organizationId: 'org-a',
        rolePermissions: [
          { permission: { code: 'nexus:invoices:read' } },
          { permission: { code: 'nexus:invoices:create' } },
          { permission: { code: 'nexus:invoices:update' } },
          { permission: { code: 'nexus:invoices:manage' } },
        ],
      },
    };

    txA = {
      organizationUser: { findUnique: jest.fn(async () => membershipA) },
      invoice: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(),
      },
      deliveryNote: {
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(),
      },
      productService: {
        findFirst: jest.fn(async () => null),
      },
      quote: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(),
      },
      lineItem: {
        deleteMany: jest.fn(),
      },
      invoiceSequence: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(),
      },
      salesOperation: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      salesStockAllocation: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
      },
      $executeRaw: jest.fn(async () => 1),
    };

    service = new InvoicesService({
      $transaction: async (fn: any) => fn(txA),
    } as any);
  });

  it('rejects missing authentication before reading the database', async () => {
    await expect(service.list(undefined as any)).rejects.toThrow('Missing authenticated');
    expect(txA.organizationUser.findUnique).not.toHaveBeenCalled();
  });

  it('scopes list to authenticated tenant', async () => {
    await expect(service.list(contextA)).resolves.toEqual([]);
    expect(txA.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-a' },
      })
    );
  });

  it('rejects invalid due date on create', async () => {
    const dto = {
      customerId: 'cli-1',
      dueDate: 'invalid-date-string',
      lineItems: [{ productServiceId: 'prod-1', description: 'Item 1', quantity: 1, unitPrice: 100 }],
    };

    await expect(service.create(contextA, dto, 'key-1')).rejects.toThrow('INVALID_DUE_DATE');
  });

  it('rejects customer belonging to another tenant on create and update', async () => {
    txA.customer.findFirst.mockResolvedValue(null);

    const createDto = {
      customerId: 'cli-foreign',
      dueDate: '2026-12-31T00:00:00.000Z',
      lineItems: [{ productServiceId: 'prod-1', description: 'Item 1', quantity: 1, unitPrice: 100 }],
    };

    await expect(service.create(contextA, createDto, 'key-2')).rejects.toThrow('Customer not found');

    txA.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      organizationId: 'org-a',
      customerId: 'cli-local',
      status: 'DRAFT',
      lineItems: [],
      deliveryNotes: [],
    });

    const updateDto = {
      customerId: 'cli-foreign',
    };

    await expect(service.update(contextA, 'inv-1', updateDto, 'key-3')).rejects.toThrow('Customer not found');
  });

  it('rejects update on non-draft invoice with INVOICE_LOCKED', async () => {
    txA.invoice.findFirst.mockResolvedValue({
      id: 'inv-unpaid',
      organizationId: 'org-a',
      customerId: 'cli-1',
      status: 'UNPAID',
      lineItems: [],
      deliveryNotes: [],
    });

    await expect(service.update(contextA, 'inv-unpaid', { customerId: 'cli-1' }, 'key-4')).rejects.toThrow(
      'INVOICE_LOCKED'
    );
  });

  it('validates deliveryNoteIds: rejects customer mismatch, cancelled status, and already invoiced', async () => {
    txA.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-a' });

    // Customer mismatch
    txA.deliveryNote.findMany.mockResolvedValue([
      { id: 'dn-1', organizationId: 'org-a', customerId: 'cli-OTHER', status: 'DRAFT' },
    ]);

    const dto1 = {
      customerId: 'cli-1',
      dueDate: '2026-12-31T00:00:00.000Z',
      lineItems: [{ productServiceId: 'prod-1', description: 'Item 1', quantity: 1, unitPrice: 100 }],
      deliveryNoteIds: ['dn-1'],
    };

    await expect(service.create(contextA, dto1, 'key-dn-1')).rejects.toThrow('CUSTOMER_MISMATCH_DELIVERY_NOTE');

    // Cancelled delivery note
    txA.deliveryNote.findMany.mockResolvedValue([
      { id: 'dn-2', organizationId: 'org-a', customerId: 'cli-1', status: 'CANCELLED' },
    ]);

    await expect(service.create(contextA, dto1, 'key-dn-2')).rejects.toThrow('DELIVERY_NOTE_CANCELLED');

    // Already invoiced delivery note
    txA.deliveryNote.findMany.mockResolvedValue([
      { id: 'dn-3', organizationId: 'org-a', customerId: 'cli-1', status: 'DRAFT', invoiceId: 'inv-other' },
    ]);

    await expect(service.create(contextA, dto1, 'key-dn-3')).rejects.toThrow('ALREADY_INVOICED');
  });

  it('recovers sequence from existing invoices in database (0042 -> 0043)', async () => {
    const draftInvoice = {
      id: 'inv-seq-test',
      organizationId: 'org-a',
      customerId: 'cli-1',
      status: 'DRAFT',
      totalAmount: 150,
      lineItems: [{ productServiceId: 'prod-1', quantity: 1, unitPrice: 150 }],
      deliveryNotes: [],
    };

    txA.invoice.findFirst.mockResolvedValue(draftInvoice);
    txA.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-a' });
    txA.productService.findFirst.mockResolvedValue({ id: 'prod-1', organizationId: 'org-a', type: 'SERVICE' });

    // Existing invoice FAC-2026-0042 in database
    txA.invoice.findMany.mockResolvedValue([{ invoiceNumber: 'FAC-2026-0042' }]);
    txA.invoiceSequence.findUnique.mockResolvedValue(null); // Sequence missing or behind

    let updatedInvoice: any;
    txA.invoice.update.mockImplementation(async (args: any) => {
      updatedInvoice = { ...draftInvoice, ...args.data };
      return updatedInvoice;
    });

    const issued = await service.issueInvoice(contextA, 'inv-seq-test', 'key-issue-seq');

    expect(issued.invoiceNumber).toEqual(`FAC-${new Date().getUTCFullYear()}-0043`);
    expect(txA.invoiceSequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ value: 43 }),
        update: expect.objectContaining({ value: 43 }),
      })
    );
  });

  it('restores stock on cancellation only for standalone invoice with active allocation', async () => {
    const unpaidInvoice = {
      id: 'inv-cancel-test',
      organizationId: 'org-a',
      customerId: 'cli-1',
      status: 'UNPAID',
      totalAmount: 200,
      amountPaid: 0,
      lineItems: [{ productServiceId: 'prod-stock', quantity: 2 }],
      deliveryNotes: [],
    };

    txA.invoice.findFirst.mockResolvedValue(unpaidInvoice);
    txA.salesStockAllocation.findMany.mockResolvedValue([
      { organizationId: 'org-a', scope: 'INVOICE:inv-cancel-test', productId: 'prod-stock', quantity: 2 },
    ]);
    txA.productService.findFirst.mockResolvedValue({
      id: 'prod-stock',
      organizationId: 'org-a',
      type: 'PRODUCT',
      purchaseCost: 50,
    });
    txA.invoice.update.mockResolvedValue({ ...unpaidInvoice, status: 'CANCELLED' });

    const result = await service.cancelInvoice(contextA, 'inv-cancel-test', 'Cancel test', 'key-cancel-1');

    expect(result.status).toEqual('CANCELLED');
    expect(txA.customer.update).toHaveBeenCalledWith({
      where: { id: 'cli-1' },
      data: { balance: { decrement: 200 } },
    });
    expect(txA.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'IN',
          quantity: 2,
          reason: 'INVOICE_CANCEL_RESTORE',
        }),
      })
    );
  });
});
