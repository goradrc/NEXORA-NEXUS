import 'reflect-metadata';
import { randomUUID, createHmac } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AuthService } from '@nexora/core';
import { PrismaService } from '../src/database/database.service';
import { DeliveryNotesService } from '../src/modules/nexus/delivery-notes/delivery-notes.service';
import { DeliveryNotesModule } from '../src/modules/nexus/delivery-notes/delivery-notes.module';

const enabled = process.env.DELIVERY_TEST_DATABASE_URL;
(enabled ? describe : describe.skip)('Delivery Notes PostgreSQL and HTTP', () => {
  let db: PrismaService;
  let service: DeliveryNotesService;
  let app: any;
  let url: string;
  let c: { organizationId: string; userId: string };
  let customer: any;
  let product: any;
  let serviceItem: any;
  let role: any;
  const previousUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;
  const dto = (quantity = 2, extra: any = {}) => ({ customerId: customer.id,
    lineItems: [{ productServiceId: product.id, description: 'Product', quantity, unitPrice: 5 }], ...extra });
  const create = (quantity = 2, extra: any = {}) => service.create(c, dto(quantity, extra), randomUUID());
  const ship = (id: string) => service.transition(c, id, 'SHIPPED');
  const deliver = (id: string) => service.transition(c, id, 'DELIVERED');
  const stock = async () => (await db.productService.findUniqueOrThrow({ where: { id: product.id } })).currentStock;
  const movements = () => db.stockMovement.findMany({ where: { organizationId: c.organizationId } });
  const invoice = (quantity = 5) => db.invoice.create({ data: { organizationId: c.organizationId, customerId: customer.id,
    invoiceNumber: randomUUID(), totalUntaxed: quantity * 5, totalTax: 0, totalAmount: quantity * 5,
    amountDue: quantity * 5, dueDate: new Date(), lineItems: { create: {
      productServiceId: product.id, description: 'Product', quantity, unitPrice: 5, totalPrice: quantity * 5,
    } } } });
  beforeAll(async () => {
    const parsed = new URL(enabled!);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/delivery_test') throw new Error('Dedicated local delivery_test database required');
    process.env.DATABASE_URL = enabled;
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    db = new PrismaService();
    await db.$connect();
    service = new DeliveryNotesService(db);
    app = await NestFactory.create(DeliveryNotesModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  }, 30000);
  afterAll(async () => {
    await app?.close(); await db?.$disconnect();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  beforeEach(async () => {
    const organization = await db.organization.create({ data: { name: 'Delivery Test ' + randomUUID() } });
    const user = await db.user.create({ data: { email: randomUUID() + '@example.test', passwordHash: 'unused', firstName: 'Test', lastName: 'User' } });
    c = { organizationId: organization.id, userId: user.id };
    role = await db.role.create({ data: { organizationId: organization.id, name: 'test-admin', rolePermissions: { create: {
      permission: { connectOrCreate: { where: { code: 'nexus:admin' }, create: { code: 'nexus:admin' } } },
    } } } });
    await db.organizationUser.create({ data: { ...c, roleId: role.id } });
    customer = await db.customer.create({ data: { organizationId: c.organizationId, code: 'C', name: 'Customer' } });
    const category = await db.category.create({ data: { organizationId: c.organizationId, name: 'Products', type: 'PRODUCT' } });
    product = await db.productService.create({ data: { organizationId: c.organizationId, categoryId: category.id,
      type: 'PRODUCT', reference: 'P', name: 'Product', salePrice: 5, currentStock: 10 } });
    serviceItem = await db.productService.create({ data: { organizationId: c.organizationId, categoryId: category.id,
      type: 'SERVICE', reference: 'S', name: 'Service', salePrice: 5 } });
  });
  it('persists create idempotence across clients and rejects key/payload reuse', async () => {
    const key = randomUUID();
    const first = await service.create(c, dto(), key);
    const other = new PrismaService();
    try { expect((await new DeliveryNotesService(other).create(c, dto(), key)).id).toBe(first.id); }
    finally { await other.$disconnect(); }
    await expect(service.create(c, dto(3), key)).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
    expect(await db.deliveryNote.count({ where: { organizationId: c.organizationId } })).toBe(1);
    expect(await db.auditLog.count({ where: { organizationId: c.organizationId, action: 'CREATE' } })).toBe(1);
  });
  it('deduplicates concurrent create requests and generates distinct numbers for distinct requests', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([service.create(c, dto(), key), service.create(c, dto(), key)]);
    expect(a.id).toBe(b.id);
    const [d, e] = await Promise.all([create(), create()]);
    expect(new Set([a.deliveryNumber, d.deliveryNumber, e.deliveryNumber]).size).toBe(3);
  });
  it('edits only drafts; shipping has no stock effect; delivery is repeatable without extra stock or audit', async () => {
    const note = await create();
    await service.update(c, note.id, { notes: 'updated' });
    await expect(deliver(note.id)).rejects.toThrow('INVALID_DELIVERY_TRANSITION');
    await ship(note.id); expect(await stock()).toBe(10);
    await expect(service.update(c, note.id, { notes: 'forbidden' })).rejects.toThrow('DELIVERY_NOTE_LOCKED');
    await Promise.all([deliver(note.id), deliver(note.id)]);
    expect(await stock()).toBe(8); expect(await movements()).toHaveLength(1);
    expect(await db.auditLog.count({ where: { entityId: note.id, action: 'DELIVERED' } })).toBe(1);
    await expect(service.transition(c, note.id, 'CANCELLED')).rejects.toThrow('INVALID_DELIVERY_TRANSITION');
  });
  it('cancels draft and shipped documents without stock movements', async () => {
    for (const shipped of [false, true]) {
      const note = await create(); if (shipped) await ship(note.id);
      await service.transition(c, note.id, 'CANCELLED');
      await expect(deliver(note.id)).rejects.toThrow('INVALID_DELIVERY_TRANSITION');
    }
    expect(await stock()).toBe(10); expect(await movements()).toHaveLength(0);
  });
  it('excludes SERVICE and aggregates repeated PRODUCT lines', async () => {
    const note = await create(2, { lineItems: [...dto(2).lineItems, ...dto(3).lineItems,
      { productServiceId: serviceItem.id, description: 'Service', quantity: 100, unitPrice: 2 }] });
    await ship(note.id); await deliver(note.id);
    expect(await stock()).toBe(5); expect(await movements()).toHaveLength(1);
    expect((await db.productService.findUniqueOrThrow({ where: { id: serviceItem.id } })).currentStock).toBe(0);
  });
  it('rolls back a multi-product delivery when one product has insufficient stock', async () => {
    const poor = await db.productService.create({ data: { organizationId: c.organizationId, categoryId: product.categoryId,
      type: 'PRODUCT', reference: 'Z', name: 'Poor', salePrice: 1, currentStock: 0 } });
    const note = await create(2, { lineItems: [...dto().lineItems, { productServiceId: poor.id, description: 'Poor', quantity: 1, unitPrice: 1 }] });
    await ship(note.id);
    await expect(deliver(note.id)).rejects.toThrow('INSUFFICIENT_STOCK');
    expect(await stock()).toBe(10); expect(await movements()).toHaveLength(0);
    expect((await service.get(c, note.id)).status).toBe('SHIPPED');
    expect(await db.salesStockAllocation.count({ where: { organizationId: c.organizationId } })).toBe(0);
  });
  it('allows only one concurrent competing delivery when stock covers one', async () => {
    const a = await create(7); const b = await create(7); await ship(a.id); await ship(b.id);
    const results = await Promise.allSettled([deliver(a.id), deliver(b.id)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe(3); expect(await movements()).toHaveLength(1);
  });
  it.each(['invoice-first', 'delivery-first', 'concurrent'])('prevents double stock consumption: %s', async order => {
    const inv = await invoice(); const note = await create(5, { invoiceId: inv.id }); await ship(note.id);
    if (order === 'invoice-first') { await service.issueInvoice(c, inv.id); await deliver(note.id); }
    if (order === 'delivery-first') { await deliver(note.id); await service.issueInvoice(c, inv.id); }
    if (order === 'concurrent') await Promise.all([deliver(note.id), service.issueInvoice(c, inv.id)]);
    expect(await stock()).toBe(5);
    expect((await movements()).reduce((sum, m) => sum + m.quantity, 0)).toBe(5);
  });
  it('accounts for partial deliveries and rejects excess delivered quantities', async () => {
    const inv = await invoice(5);
    const a = await create(2, { invoiceId: inv.id }); const b = await create(3, { invoiceId: inv.id });
    await ship(a.id); await deliver(a.id); expect(await stock()).toBe(8);
    await service.issueInvoice(c, inv.id); expect(await stock()).toBe(5);
    await ship(b.id); await deliver(b.id); expect(await stock()).toBe(5);
    const excess = await create(1, { invoiceId: inv.id }); await ship(excess.id);
    await expect(deliver(excess.id)).rejects.toThrow('INVOICE_QUANTITY_EXCEEDED');
  });
  it('refuses to guess at legacy invoice stock movements', async () => {
    const inv = await invoice();
    await db.stockMovement.create({ data: { organizationId: c.organizationId, productId: product.id,
      type: 'OUT', quantity: 5, unitCost: 0, referenceDocType: 'INVOICE', referenceDocId: inv.id } });
    const note = await create(5, { invoiceId: inv.id }); await ship(note.id);
    await expect(deliver(note.id)).rejects.toThrow('LEGACY_STOCK_RECONCILIATION_REQUIRED');
    expect(await stock()).toBe(10);
  });
  it('consumes fractional stock exactly across partial deliveries', async () => {
    await db.productService.update({ where: { id: product.id }, data: { currentStock: 0.3 } });
    const inv = await invoice(0.3);
    const a = await create(0.1, { invoiceId: inv.id }); const b = await create(0.2, { invoiceId: inv.id });
    await ship(a.id); await ship(b.id); await deliver(a.id); await deliver(b.id);
    await service.issueInvoice(c, inv.id);
    expect(await stock()).toBe(0);
  });
  it('blocks pre-existing issued invoices with no persistent stock allocation', async () => {
    const inv = await invoice();
    await db.invoice.update({ where: { id: inv.id }, data: { status: 'UNPAID' } });
    const note = await create(2, { invoiceId: inv.id }); await ship(note.id);
    await expect(deliver(note.id)).rejects.toThrow('LEGACY_STOCK_RECONCILIATION_REQUIRED');
    expect(await stock()).toBe(10);
  });
  it('rejects foreign catalog, invoice and quote references', async () => {
    const other = await db.organization.create({ data: { name: 'Other sources' } });
    const cat = await db.category.create({ data: { organizationId: other.id, name: 'Other', type: 'PRODUCT' } });
    const p = await db.productService.create({ data: { organizationId: other.id, categoryId: cat.id,
      type: 'PRODUCT', reference: 'F', name: 'Foreign', salePrice: 1 } });
    await expect(create(2, { lineItems: [{ ...dto().lineItems[0], productServiceId: p.id }] })).rejects.toThrow('Catalog item not found');
    await expect(create(2, { invoiceId: randomUUID() })).rejects.toThrow('Invoice not found');
    await expect(create(2, { quoteId: randomUUID() })).rejects.toThrow('Quote not found');
  });
  it('links an accepted quote and rejects source customer mismatch', async () => {
    const quote = await db.quote.create({ data: { organizationId: c.organizationId, customerId: customer.id,
      quoteNumber: 'Q', status: 'ACCEPTED', totalUntaxed: 10, totalTax: 0, totalAmount: 10, validUntil: new Date() } });
    expect((await create(2, { quoteId: quote.id })).quoteId).toBe(quote.id);
    const otherCustomer = await db.customer.create({ data: { organizationId: c.organizationId, code: 'B', name: 'Other customer' } });
    await expect(create(2, { customerId: otherCustomer.id, quoteId: quote.id })).rejects.toThrow('INVALID_QUOTE_SOURCE');
  });
  it('replays keyed updates without repeating the audit and requires a creation key', async () => {
    await expect(service.create(c, dto())).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED');
    const note = await create();
    await service.update(c, note.id, { notes: 'one' }, 'update-key');
    await service.update(c, note.id, { notes: 'one' }, 'update-key');
    await expect(service.update(c, note.id, { notes: 'two' }, 'update-key')).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
    expect(await db.auditLog.count({ where: { entityId: note.id, action: 'UPDATE' } })).toBe(1);
  });
  it('rolls back status, stock, allocation and idempotency when audit insertion fails', async () => {
    const note = await create(); await ship(note.id);
    const broken = { $transaction: (work: any, options: any) => db.$transaction(async tx => {
      const proxy = new Proxy(tx, { get(target, prop) {
        if (prop === 'auditLog') return { create: async () => { throw new Error('Audit unavailable'); } };
        return (target as any)[prop];
      } });
      return work(proxy);
    }, options) };
    await expect(new DeliveryNotesService(broken as any).transition(c, note.id, 'DELIVERED', 'audit-fail')).rejects.toThrow('Audit unavailable');
    expect(await stock()).toBe(10); expect(await movements()).toHaveLength(0);
    expect((await service.get(c, note.id)).status).toBe('SHIPPED');
    expect(await db.salesOperation.count({ where: { ...c, key: 'audit-fail' } })).toBe(0);
    await deliver(note.id); expect(await stock()).toBe(8);
  });
  it('rejects foreign tenant references and absent memberships', async () => {
    const other = await db.organization.create({ data: { name: 'Other' } });
    const foreign = await db.customer.create({ data: { organizationId: other.id, code: 'F', name: 'Foreign' } });
    await expect(create(2, { customerId: foreign.id })).rejects.toThrow('Customer not found');
    const note = await create();
    await expect(service.get({ ...c, organizationId: other.id }, note.id)).rejects.toThrow('membership');
    await db.organizationUser.update({ where: { organizationId_userId: c }, data: { status: 'INACTIVE' } });
    await expect(ship(note.id)).rejects.toThrow('membership');
  });
  it('rejects mass assignment and invalid quantities before writes', async () => {
    await expect(create(2, { organizationId: 'spoof' })).rejects.toThrow('INVALID_FIELDS');
    for (const quantity of [0, -1, NaN, Infinity]) await expect(create(quantity)).rejects.toThrow('INVALID_LINE_NUMBER');
    expect(await db.deliveryNote.count({ where: { organizationId: c.organizationId } })).toBe(0);
  });
  it('enforces mutation permissions even when replaying a previously authorized request', async () => {
    const note = await service.create(c, dto(), 'replay-rbac'); const inv = await invoice();
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await expect(service.create(c, dto(), 'replay-rbac')).rejects.toThrow('nexus:delivery-notes:create');
    await expect(service.update(c, note.id, { notes: 'denied' })).rejects.toThrow('nexus:delivery-notes:update');
    await expect(ship(note.id)).rejects.toThrow('nexus:delivery-notes:manage');
    await expect(service.issueInvoice(c, inv.id)).rejects.toThrow('nexus:invoices:manage');
    expect(await stock()).toBe(10);
  });
  it('hides another tenant document even for a valid member of both tenants', async () => {
    const note = await create();
    const other = await db.organization.create({ data: { name: 'Second tenant' } });
    const otherRole = await db.role.create({ data: { organizationId: other.id, name: 'admin',
      rolePermissions: { create: { permission: { connect: { code: 'nexus:admin' } } } } } });
    const otherContext = { ...c, organizationId: other.id };
    await db.organizationUser.create({ data: { ...otherContext, roleId: otherRole.id } });
    expect(await service.list(otherContext)).toEqual([]);
    await expect(service.get(otherContext, note.id)).rejects.toThrow('Delivery note not found');
    await expect(service.transition(otherContext, note.id, 'SHIPPED')).rejects.toThrow('Delivery note not found');
  });
  it('enforces database nonnegative stock even outside the service', async () => {
    await expect(db.productService.update({ where: { id: product.id }, data: { currentStock: -1 } })).rejects.toThrow();
  });
  it('review: preserves the shared untaxed line total contract', async () => {
    const note = await create(2, { lineItems: [{ ...dto(2).lineItems[0], unitPrice: 10, taxRate: 20, discountPercent: 10 }] });
    expect(note.lineItems[0].totalPrice).toBe(18);
  });
  it('review: refuses invoice issue for a historical delivered note without allocation proof', async () => {
    const inv = await invoice(); const note = await create(5, { invoiceId: inv.id });
    await db.deliveryNote.update({ where: { id: note.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    await expect(service.issueInvoice(c, inv.id)).rejects.toThrow('LEGACY_STOCK_RECONCILIATION_REQUIRED');
    expect(await stock()).toBe(10);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('DRAFT');
  });
  it('review: rejects empty source identifiers as validation errors', async () => {
    await expect(create(2, { invoiceId: '' })).rejects.toThrow('INVALID_TEXT');
    await expect(create(2, { quoteId: ' ' })).rejects.toThrow('INVALID_TEXT');
  });
  it('serves real authenticated HTTP routes, rejects forged/refresh/expired tokens and enforces RBAC', async () => {
    const tokens = AuthService.generateTokens({ ...c, email: 'test@example.test' });
    const request = (path: string, method = 'GET', body?: any, token = tokens.accessToken) => fetch(url + '/api/v1/nexus/' + path,
      { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        body: body ? JSON.stringify(body) : undefined });
    expect((await request('delivery-notes', 'GET', undefined, 'forged')).status).toBe(401);
    expect((await request('delivery-notes', 'GET', undefined, tokens.refreshToken)).status).toBe(401);
    const parts = tokens.accessToken.split('.');
    parts[1] = Buffer.from(JSON.stringify({ ...c, email: 'test@example.test', exp: 1 })).toString('base64url');
    parts[2] = createHmac('sha256', process.env.JWT_SECRET!).update(parts[0] + '.' + parts[1]).digest('base64url');
    expect((await request('delivery-notes', 'GET', undefined, parts.join('.'))).status).toBe(401);
    const response = await request('delivery-notes', 'POST', dto()); expect(response.status).toBe(201);
    const note: any = await response.json();
    expect(typeof note.createdAt).toBe('string');
    expect((await request('delivery-notes/' + note.id, 'PUT', { notes: 'HTTP' })).status).toBe(200);
    expect((await request('delivery-notes/' + note.id + '/ship', 'POST')).status).toBe(201);
    expect((await request('delivery-notes/' + note.id + '/deliver', 'POST')).status).toBe(201);
    expect((await request('delivery-notes')).status).toBe(200);
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    expect((await request('delivery-notes')).status).toBe(403);
  });
});
