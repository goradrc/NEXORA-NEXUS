import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/database.service';
import { provision } from '../src/auth/provision';
import { AuthService } from '../../../packages/core/src/auth/auth.service';

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Real Sales authentication HTTP/PostgreSQL', () => {
  let app: any, db: PrismaService, url: string, identity: any, email: string;
  const password = 'Test-only-' + randomUUID();
  const previousUrl = process.env.DATABASE_URL, previousSecret = process.env.JWT_SECRET;
  const call = async (path: string, body?: any, token?: string) => {
    const response = await fetch(url + '/api/v1' + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  const login = () => call('/auth/login', { email, password });
  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/auth_test') throw new Error('Dedicated local auth_test required');
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    app = await NestFactory.create(AppModule, { logger: false });
    db = app.get(PrismaService);
    app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  }, 30000);
  beforeEach(async () => {
    email = randomUUID() + '@example.test';
    identity = await provision(db, { email, password, organization: 'Auth test' });
  });
  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  it('logs in with normalized email and reads only its own delivery notes', async () => {
    const result = await call('/auth/login', { email: email.toUpperCase(), password });
    expect(result.status).toBe(201);
    expect(result.data.user.permissions).toEqual(['nexus:delivery-notes:read']);
    expect(JSON.stringify(result.data)).not.toContain('passwordHash');
    const customer = await db.customer.create({ data: { organizationId: identity.organizationId, name: 'Customer', code: 'C' } });
    await db.deliveryNote.create({ data: { organizationId: identity.organizationId, customerId: customer.id, deliveryNumber: 'BL-TEST' } });
    const notes = await call('/nexus/delivery-notes', undefined, result.data.accessToken);
    expect(notes.status).toBe(200); expect(notes.data).toHaveLength(1);
    expect(notes.data[0].organizationId).toBe(identity.organizationId);
    const other = await provision(db, { email: randomUUID() + '@example.test', password, organization: 'Other' });
    const foreign = await call('/auth/login', { email: (await db.user.findUniqueOrThrow({ where: { id: other.userId } })).email, password });
    expect((await call('/nexus/delivery-notes/' + notes.data[0].id, undefined, foreign.data.accessToken)).status).toBe(404);
    expect((await call('/nexus/delivery-notes', { customerId: customer.id, lineItems: [], idempotencyKey: randomUUID() }, result.data.accessToken)).status).toBe(403);
  });
  it('rejects bad passwords, missing tokens, and inactive accounts', async () => {
    expect((await call('/auth/login', { email, password: 'wrong' })).status).toBe(401);
    expect((await call('/auth/me')).status).toBe(401);
    await db.user.update({ where: { id: identity.userId }, data: { isActive: false } });
    expect((await login()).status).toBe(401);
  });
  it('rereads permissions and revokes disabled membership immediately', async () => {
    const token = (await login()).data.accessToken;
    const member = await db.organizationUser.findFirstOrThrow({ where: { userId: identity.userId } });
    await db.rolePermission.deleteMany({ where: { roleId: member.roleId } });
    expect((await call('/auth/me', undefined, token)).data.user.permissions).toEqual([]);
    expect((await call('/nexus/delivery-notes', undefined, token)).status).toBe(403);
    await db.organizationUser.update({ where: { id: member.id }, data: { status: 'INACTIVE' } });
    expect((await call('/auth/me', undefined, token)).status).toBe(401);
    expect((await login()).status).toBe(401);
  });
  it('switches only to an active authorized organization and issues a matching token', async () => {
    const token = (await login()).data.accessToken;
    const organization = await db.organization.create({ data: { name: 'Second' } });
    expect((await call('/auth/switch-organization', { organizationId: organization.id }, token)).status).toBe(401);
    const role = await db.role.create({ data: { organizationId: organization.id, name: 'No access' } });
    await db.organizationUser.create({ data: { organizationId: organization.id, userId: identity.userId, roleId: role.id } });
    const switched = await call('/auth/switch-organization', { organizationId: organization.id }, token);
    expect(switched.status).toBe(201);
    expect(AuthService.verifyToken<any>(switched.data.accessToken).organizationId).toBe(organization.id);
    expect(switched.data.user.permissions).toEqual([]);
    expect((await call('/nexus/delivery-notes', undefined, switched.data.accessToken)).status).toBe(403);
    await db.role.update({ where: { id: role.id }, data: { organizationId: identity.organizationId } });
    expect((await call('/auth/me', undefined, switched.data.accessToken)).status).toBe(401);
  });
  it('rejects tampered and refresh tokens', async () => {
    const result = await login();
    expect((await call('/auth/me', undefined, result.data.accessToken + 'x')).status).toBe(401);
    const refresh = AuthService.generateTokens(result.data.user).refreshToken;
    expect((await call('/auth/me', undefined, refresh)).status).toBe(401);
  });
  it('provisioning never overwrites an existing user or grants additional membership', async () => {
    await expect(provision(db, { email, password: 'Another-password-123', organization: 'Duplicate' })).rejects.toThrow();
    expect(await db.organizationUser.count({ where: { userId: identity.userId } })).toBe(1);
    expect((await login()).status).toBe(201);
  });
});
