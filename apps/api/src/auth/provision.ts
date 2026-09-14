import { PrismaClient } from '@prisma/client';
import { AuthService } from '../../../../packages/core/src/auth/auth.service';

/** Explicit local operator command. Never runs when the API starts. */
export async function provision(db: PrismaClient, input: { email: string; password: string; organization: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      input.password.length < 12 || input.password.length > 1024 || !input.organization.trim()) {
    throw new Error('Valid email, organization and password of 12–1024 characters required');
  }
  const passwordHash = AuthService.hashPassword(input.password);
  return db.$transaction(async tx => {
    // Unique email prevents overwriting an existing account or extending its access silently.
    const user = await tx.user.create({ data: { email, passwordHash, firstName: 'Sales', lastName: 'User' } });
    const organization = await tx.organization.create({ data: { name: input.organization.trim() } });
    const permission = await tx.permission.upsert({ where: { code: 'nexus:delivery-notes:read' },
      create: { code: 'nexus:delivery-notes:read' }, update: {} });
    const role = await tx.role.create({ data: { organizationId: organization.id, name: 'Sales Reader',
      rolePermissions: { create: { permissionId: permission.id } } } });
    await tx.organizationUser.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id } });
    return { userId: user.id, organizationId: organization.id };
  });
}

if (require.main === module) {
  const db = new PrismaClient();
  Promise.resolve().then(async () => {
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || process.env.NODE_ENV === 'production') {
      throw new Error('Local development database required');
    }
    const result = await provision(db, { email: process.env.NEXUS_USER_EMAIL || '',
      password: process.env.NEXUS_USER_PASSWORD || '', organization: process.env.NEXUS_ORGANIZATION || '' });
    console.log(JSON.stringify(result));
  }).catch(() => { console.error('Provisioning failed; no existing account was changed. Check inputs and database.'); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
