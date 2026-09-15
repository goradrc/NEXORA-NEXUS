import 'reflect-metadata';
import { randomUUID, createHmac } from 'crypto';
import { AuthService } from '@nexora/core';
import { PrismaService } from '../src/database/database.service';
import { InvoicesService } from '../src/modules/nexus/invoices/invoices.service';
import { DeliveryNotesService } from '../src/modules/nexus/delivery-notes/delivery-notes.service';

const enabled = process.env.DELIVERY_TEST_DATABASE_URL;

(enabled ? describe : describe.skip)('Sales Invoices PostgreSQL and HTTP Real Integration', () => {
  let db: PrismaService;
  let service: InvoicesService;
  let dnService: DeliveryNotesService;
  let app: any;
  let url: string;
  let c: { organizationId: string; userId: string };
  let customer: any;
  let product: any;
  let role: any;

  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;

  const invoiceDto = (quantity = 2, extra: any = {}) => ({
    customerId: customer.id,
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    lineItems: [{ productServiceId: product.id, description: 'Product item', quantity, unitPrice: 10, taxRate: 20 }],
    ...extra,
  });

  const createInvoice = (quantity = 2, extra: any = {}) =>
    service.create(c, invoiceDto(quantity, extra), randomUUID());

  const stock = async () =>
    (await db.productService.findUniqueOrThrow({ where: { id: product.id } })).currentStock;

  const movements = () => db.stockMovement.findMany({ where: { organizationId: c.organizationId } });

  beforeAll(async () => {
    const parsed = new URL(enabled!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/delivery_test') {
      throw new Error('Dedicated local delivery_test database required');
    }

    process.env.DATABASE_URL = enabled;
    process.env.JWT_SECRET = randomUUID() + randomUUID();

    db = new PrismaService();
    await db.$connect();

    service = new InvoicesService(db);
    dnService = new DeliveryNotesService(db);

    const { NestFactory } = await import('@nestjs/core');
    const { InvoicesModule } = await import('../src/modules/nexus/invoices/invoices.module');
    app = await NestFactory.create(InvoicesModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  beforeEach(async () => {
    const organization = await db.organization.create({ data: { name: 'Invoice Test ' + randomUUID() } });
    const user = await db.user.create({
      data: {
        email: randomUUID() + '@example.test',
        passwordHash: 'unused',
        firstName: 'Test',
        lastName: 'User',
      },
    });

    c = { organizationId: organization.id, userId: user.id };

    role = await db.role.create({
      data: {
        organizationId: organization.id,
        name: 'test-admin',
        rolePermissions: {
          create: {
            permission: { connectOrCreate: { where: { code: 'nexus:admin' }, create: { code: 'nexus:admin' } } },
          },
        },
      },
    });

    await db.organizationUser.create({ data: { ...c, roleId: role.id } });

    customer = await db.customer.create({ data: { organizationId: c.organizationId, code: 'C1', name: 'Invoice Customer' } });
    const category = await db.category.create({ data: { organizationId: c.organizationId, name: 'Products', type: 'PRODUCT' } });
    product = await db.productService.create({
      data: {
        organizationId: c.organizationId,
        categoryId: category.id,
        type: 'PRODUCT',
        reference: 'P1',
        name: 'Test Product',
        salePrice: 10,
        currentStock: 100,
      },
    });
  });

  it('generates atomic sequential numbers FAC-YYYY-XXXX without duplicates under concurrent emissions', async () => {
    const invoices = await Promise.all(
      Array.from({ length: 5 }, () => createInvoice(1))
    );

    const year = new Date().getUTCFullYear();
    const issued = await Promise.all(invoices.map((inv) => service.issueInvoice(c, inv.id, randomUUID())));

    const numbers = issued.map((i) => i.invoiceNumber);
    expect(new Set(numbers).size).toBe(5);
    for (const num of numbers) {
      expect(num).toMatch(new RegExp(`^FAC-${year}-\\d{4}$`));
    }
  });

  it('recovers sequence from pre-existing DB invoice FAC-2026-0042 to FAC-2026-0043', async () => {
    const year = new Date().getUTCFullYear();

    // Insert historical invoice FAC-YYYY-0042 without entry in InvoiceSequence
    await db.invoice.create({
      data: {
        organizationId: c.organizationId,
        customerId: customer.id,
        invoiceNumber: `FAC-${year}-0042`,
        status: 'UNPAID',
        totalUntaxed: 100,
        totalTax: 0,
        totalAmount: 100,
        amountPaid: 0,
        amountDue: 100,
        dueDate: new Date(),
        lineItems: { create: { productServiceId: product.id, description: 'Prior', quantity: 1, unitPrice: 100, totalPrice: 100 } },
      },
    });

    const draft = await createInvoice(1);
    const issued = await service.issueInvoice(c, draft.id, randomUUID());

    expect(issued.invoiceNumber).toBe(`FAC-${year}-0043`);
  });

  it('prevents double stock OUT when invoice is linked to DELIVERED Delivery Note', async () => {
    const dn = await dnService.create(
      c,
      {
        customerId: customer.id,
        lineItems: [{ productServiceId: product.id, description: 'Delivered item', quantity: 10, unitPrice: 10 }],
      },
      randomUUID()
    );

    await dnService.transition(c, dn.id, 'SHIPPED');
    await dnService.transition(c, dn.id, 'DELIVERED');
    expect(await stock()).toBe(90);

    const inv = await createInvoice(10, { deliveryNoteIds: [dn.id] });
    await service.issueInvoice(c, inv.id, randomUUID());

    // Stock remains 90 (0 additional OUT movement)
    expect(await stock()).toBe(90);

    const outMovements = await db.stockMovement.findMany({
      where: { organizationId: c.organizationId, type: 'OUT' },
    });
    expect(outMovements).toHaveLength(1);
  });

  it('restores stock IN when cancelling a standalone issued invoice', async () => {
    const inv = await createInvoice(15);
    await service.issueInvoice(c, inv.id, randomUUID());

    expect(await stock()).toBe(85);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance).toBe(180); // 15 * 10 * 1.2 = 180

    await service.cancelInvoice(c, inv.id, 'Customer cancellation', randomUUID());

    expect(await stock()).toBe(100);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance).toBe(0);

    const inMovements = await db.stockMovement.findMany({
      where: { organizationId: c.organizationId, type: 'IN' },
    });
    expect(inMovements).toHaveLength(1);
    expect(inMovements[0].reason).toBe('INVOICE_CANCEL_RESTORE');
  });

  it('serves real HTTP endpoints for invoice creation, issuance, and cancellation', async () => {
    const tokens = AuthService.generateTokens({ ...c, email: 'test@example.test' });

    const request = (path: string, method = 'GET', body?: any) =>
      fetch(url + '/api/v1/nexus/' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + tokens.accessToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    const createRes = await request('invoices', 'POST', invoiceDto(5));
    expect(createRes.status).toBe(201);
    const inv: any = await createRes.json();

    const issueRes = await request(`invoices/${inv.id}/issue`, 'POST');
    expect(issueRes.status).toBe(201);
    const issued: any = await issueRes.json();
    expect(issued.status).toBe('UNPAID');

    const cancelRes = await request(`invoices/${inv.id}/cancel`, 'POST', { reason: 'HTTP cancel' });
    expect(cancelRes.status).toBe(201);
    const cancelled: any = await cancelRes.json();
    expect(cancelled.status).toBe('CANCELLED');
  });
});
