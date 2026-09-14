import { BadRequestException, ConflictException, NotFoundException } from '../src/common/exceptions';
import { TenantContext } from '@nexora/core';
import { InvoicesService } from '../src/modules/nexus/invoices/invoices.service';

describe('InvoicesService (Prisma Persistent)', () => {
  let service: InvoicesService;
  let mockPrisma: any;

  const contextOrg1: TenantContext = {
    organizationId: 'org-1',
    userId: 'user-001',
  };

  const contextOrg2: TenantContext = {
    organizationId: 'org-2',
    userId: 'user-002',
  };

  const mockMembership = {
    organizationId: 'org-1',
    userId: 'user-001',
    status: 'ACTIVE',
    user: { isActive: true },
    role: {
      organizationId: 'org-1',
      rolePermissions: [
        { permission: { code: 'nexus:invoices:read' } },
        { permission: { code: 'nexus:invoices:create' } },
        { permission: { code: 'nexus:invoices:update' } },
        { permission: { code: 'nexus:invoices:manage' } },
      ],
    },
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(async (cb, _opts) => {
        return cb(mockPrisma);
      }),
      $executeRaw: jest.fn(async () => 1),
      organizationUser: {
        findUnique: jest.fn(async () => mockMembership),
      },
      invoice: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      lineItem: {
        deleteMany: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      productService: {
        findFirst: jest.fn(),
      },
      quote: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      invoiceSequence: {
        upsert: jest.fn(),
      },
      salesStockAllocation: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      stockMovement: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      salesOperation: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      deliveryNote: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(),
      },
    };

    service = new InvoicesService(mockPrisma as any);
  });

  describe('1. list & 2. get (Tenant Isolation & Read)', () => {
    it('should list invoices for authenticated tenant only', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: 'inv-1', organizationId: 'org-1', status: 'DRAFT' },
      ]);

      const result = await service.list(contextOrg1, 0);

      expect(result).toHaveLength(1);
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 100,
        include: { lineItems: true },
      });
    });

    it('should throw NotFoundException on cross-tenant access in get', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.get(contextOrg1, 'inv-org2')).rejects.toThrow('Invoice not found');
      expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-org2', organizationId: 'org-1' },
        include: { lineItems: true },
      });
    });
  });

  describe('3. create & 4. quote conversion & 5. cross-tenant customer refusal', () => {
    it('should create a DRAFT invoice with calculated totals and line items', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1' });
      mockPrisma.productService.findFirst.mockResolvedValue({ id: 'prod-1', organizationId: 'org-1', type: 'PRODUCT' });
      mockPrisma.invoice.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'inv-new', ...args.data, lineItems: args.data.lineItems.create })
      );

      const dto = {
        customerId: 'cli-1',
        dueDate: '2026-10-01T00:00:00.000Z',
        idempotencyKey: 'key-create-1',
        lineItems: [
          { productServiceId: 'prod-1', description: 'Monitor 4K', quantity: 2, unitPrice: 100, taxRate: 20, discountPercent: 10 },
        ],
      };

      const result = await service.create(contextOrg1, dto);

      expect(result).toBeDefined();
      expect(mockPrisma.invoice.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          entityName: 'Invoice',
          action: 'CREATE',
        }),
      });
    });

    it('should throw NotFoundException if customer belongs to another tenant', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      const dto = {
        customerId: 'cli-cross-tenant',
        dueDate: '2026-10-01T00:00:00.000Z',
        idempotencyKey: 'key-cross-cust',
        lineItems: [{ productServiceId: 'prod-1', description: 'Item', quantity: 1, unitPrice: 50 }],
      };

      await expect(service.create(contextOrg1, dto)).rejects.toThrow('Customer not found');
    });

    it('should convert quote status to CONVERTED when quoteId is provided', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1' });
      mockPrisma.productService.findFirst.mockResolvedValue({ id: 'prod-1', organizationId: 'org-1', type: 'PRODUCT' });
      mockPrisma.quote.findFirst.mockResolvedValue({ id: 'quote-1', customerId: 'cli-1', status: 'ACCEPTED' });
      mockPrisma.invoice.create.mockImplementation((args: any) => Promise.resolve({ id: 'inv-quote', ...args.data }));

      const dto = {
        customerId: 'cli-1',
        quoteId: 'quote-1',
        dueDate: '2026-10-01T00:00:00.000Z',
        idempotencyKey: 'key-quote-1',
        lineItems: [{ productServiceId: 'prod-1', description: 'Item', quantity: 1, unitPrice: 50 }],
      };

      await service.create(contextOrg1, dto);

      expect(mockPrisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'quote-1' },
        data: { status: 'CONVERTED' },
      });
    });
  });

  describe('5. update & 6. INVOICE_LOCKED', () => {
    it('should update DRAFT invoice details and line items', async () => {
      const existing = {
        id: 'inv-draft',
        organizationId: 'org-1',
        customerId: 'cli-1',
        status: 'DRAFT',
        amountPaid: 0,
        lineItems: [],
      };
      mockPrisma.invoice.findFirst.mockResolvedValue(existing);
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1' });
      mockPrisma.productService.findFirst.mockResolvedValue({ id: 'prod-1', organizationId: 'org-1' });
      mockPrisma.invoice.update.mockResolvedValue({ ...existing, totalAmount: 200 });

      const dto = {
        dueDate: '2026-11-01T00:00:00.000Z',
        lineItems: [{ productServiceId: 'prod-1', description: 'Updated item', quantity: 2, unitPrice: 100 }],
      };

      const updated = await service.update(contextOrg1, 'inv-draft', dto);

      expect(mockPrisma.lineItem.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.invoice.update).toHaveBeenCalled();
      expect(updated).toBeDefined();
    });

    it('should throw ConflictException INVOICE_LOCKED if invoice status is not DRAFT', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-unpaid',
        organizationId: 'org-1',
        status: 'UNPAID',
      });

      await expect(
        service.update(contextOrg1, 'inv-unpaid', { dueDate: '2026-12-01T00:00:00.000Z' })
      ).rejects.toThrow('INVOICE_LOCKED');
    });
  });

  describe('7. Sequence FAC-YYYY-XXXX & 8. Standalone Issue + Stock & 10. Second Issue Idempotence', () => {
    it('should issue invoice, generate FAC-YYYY-XXXX sequence, reconcile stock and increment customer balance', async () => {
      const draft = {
        id: 'inv-issue-1',
        organizationId: 'org-1',
        customerId: 'cli-1',
        status: 'DRAFT',
        totalAmount: 500,
        lineItems: [
          { productServiceId: 'prod-1', quantity: 2, unitPrice: 250 },
        ],
      };

      let currentInvoiceState = { ...draft };
      mockPrisma.invoice.findFirst.mockImplementation(() => Promise.resolve(currentInvoiceState));
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1', balance: 100 });
      mockPrisma.productService.findFirst.mockResolvedValue({ id: 'prod-1', organizationId: 'org-1', type: 'PRODUCT', purchaseCost: 150 });
      mockPrisma.invoiceSequence.upsert.mockResolvedValue({ organizationId: 'org-1', year: 2026, value: 1 });
      mockPrisma.invoice.update.mockImplementation((args: any) => {
        currentInvoiceState = { ...currentInvoiceState, ...args.data };
        return Promise.resolve(currentInvoiceState);
      });

      const issued = await service.issueInvoice(contextOrg1, 'inv-issue-1');

      expect(issued.invoiceNumber).toMatch(/^FAC-\d{4}-0001$/);
      expect(issued.status).toEqual('UNPAID');
      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cli-1' },
        data: { balance: { increment: 500 } },
      });
      expect(mockPrisma.stockMovement.create).toHaveBeenCalled();
    });

    it('should be idempotent and return existing invoice when issue is called on already UNPAID invoice', async () => {
      const alreadyIssued = {
        id: 'inv-issued',
        organizationId: 'org-1',
        customerId: 'cli-1',
        status: 'UNPAID',
        invoiceNumber: 'FAC-2026-0001',
        lineItems: [{ productServiceId: 'prod-1', quantity: 1, unitPrice: 100 }],
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(alreadyIssued);
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1' });

      const result = await service.issueInvoice(contextOrg1, 'inv-issued');

      expect(result.status).toEqual('UNPAID');
      expect(mockPrisma.invoiceSequence.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });
  });

  describe('11. Insufficient Stock Rollback & 9. Delivery Note Anti-Double Stock OUT', () => {
    it('should throw ConflictException INSUFFICIENT_STOCK if product stock is below line quantity during issuance', async () => {
      const draft = {
        id: 'inv-no-stock',
        organizationId: 'org-1',
        customerId: 'cli-1',
        status: 'DRAFT',
        totalAmount: 1000,
        lineItems: [{ productServiceId: 'prod-out', quantity: 100 }],
      };

      let currentInvoiceState = { ...draft };
      mockPrisma.invoice.findFirst.mockImplementation(() => Promise.resolve(currentInvoiceState));
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1' });
      mockPrisma.productService.findFirst.mockResolvedValue({ id: 'prod-out', organizationId: 'org-1', type: 'PRODUCT' });
      mockPrisma.invoiceSequence.upsert.mockResolvedValue({ value: 1 });
      mockPrisma.invoice.update.mockImplementation((args: any) => {
        currentInvoiceState = { ...currentInvoiceState, ...args.data };
        return Promise.resolve(currentInvoiceState);
      });
      mockPrisma.$executeRaw.mockResolvedValue(0); // 0 rows updated due to current_stock < 100

      await expect(service.issueInvoice(contextOrg1, 'inv-no-stock')).rejects.toThrow('INSUFFICIENT_STOCK');
    });

    it('should NOT double deduct stock if invoice is issued for items already delivered via Delivery Note', async () => {
      const invoiceWithDN = {
        id: 'inv-linked-dn',
        organizationId: 'org-1',
        customerId: 'cli-1',
        status: 'DRAFT',
        totalAmount: 200,
        lineItems: [{ productServiceId: 'prod-1', quantity: 2 }],
      };

      const deliveredDN = {
        id: 'dn-1',
        organizationId: 'org-1',
        customerId: 'cli-1',
        invoiceId: 'inv-linked-dn',
        status: 'DELIVERED',
        lineItems: [{ productServiceId: 'prod-1', quantity: 2 }],
      };

      let currentInvoiceState = { ...invoiceWithDN };
      mockPrisma.invoice.findFirst.mockImplementation(() => Promise.resolve(currentInvoiceState));
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', organizationId: 'org-1' });
      mockPrisma.deliveryNote.findMany.mockResolvedValue([deliveredDN]);
      mockPrisma.productService.findFirst.mockResolvedValue({ id: 'prod-1', organizationId: 'org-1', type: 'PRODUCT' });
      mockPrisma.invoiceSequence.upsert.mockResolvedValue({ value: 2 });
      mockPrisma.invoice.update.mockImplementation((args: any) => {
        currentInvoiceState = { ...currentInvoiceState, ...args.data };
        return Promise.resolve(currentInvoiceState);
      });
      // Stock allocation already set for prior DELIVERED delivery note
      mockPrisma.salesStockAllocation.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        scope: 'INVOICE:inv-linked-dn',
        productId: 'prod-1',
        quantity: 2,
      });

      const issued = await service.issueInvoice(contextOrg1, 'inv-linked-dn');

      expect(issued.status).toEqual('UNPAID');
      // Stock delta is 0 because desired 2 equals allocated 2, so $executeRaw is NOT called for delta
      expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('12. Cancel Standalone, 13. Cancel Linked DN, 14. Second Cancel, 15. Audit Log', () => {
    it('should cancel UNPAID invoice and decrement unpaid amount from customer balance', async () => {
      const unpaidInvoice = {
        id: 'inv-cancel',
        organizationId: 'org-1',
        customerId: 'cli-1',
        status: 'UNPAID',
        totalAmount: 300,
        amountPaid: 0,
        lineItems: [],
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(unpaidInvoice);
      mockPrisma.invoice.update.mockResolvedValue({ ...unpaidInvoice, status: 'CANCELLED' });

      const cancelled = await service.cancelInvoice(contextOrg1, 'inv-cancel', 'Customer request');

      expect(cancelled.status).toEqual('CANCELLED');
      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cli-1' },
        data: { balance: { decrement: 300 } },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          entityName: 'Invoice',
          action: 'CANCEL',
        }),
      });
    });

    it('should throw ConflictException if trying to cancel a PAID invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-paid',
        organizationId: 'org-1',
        status: 'PAID',
      });

      await expect(
        service.cancelInvoice(contextOrg1, 'inv-paid', 'Cancellation attempt')
      ).rejects.toThrow('CANNOT_CANCEL_PAID_INVOICE');
    });

    it('should be idempotent and return existing invoice when cancel is called on CANCELLED invoice', async () => {
      const cancelledInvoice = {
        id: 'inv-already-cancelled',
        organizationId: 'org-1',
        status: 'CANCELLED',
      };

      mockPrisma.invoice.findFirst.mockResolvedValue(cancelledInvoice);

      const result = await service.cancelInvoice(contextOrg1, 'inv-already-cancelled');

      expect(result.status).toEqual('CANCELLED');
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });
  });
});
