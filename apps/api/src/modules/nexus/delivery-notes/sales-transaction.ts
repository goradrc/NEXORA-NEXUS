import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RolesGuard, TenantContext } from '../../../../../../packages/core/src';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../database/database.service';

export async function authorize(tx: Prisma.TransactionClient, context: TenantContext, permission: string) {
  if (!context?.organizationId || !context?.userId) throw new UnauthorizedException('Missing authenticated tenant context');
  const membership = await tx.organizationUser.findUnique({
    where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } },
    include: { user: true, role: { include: { rolePermissions: { include: { permission: true } } } } },
  });
  if (!membership || membership.status !== 'ACTIVE' || !membership.user.isActive ||
      (membership.role.organizationId !== null && membership.role.organizationId !== context.organizationId)) {
    throw new ForbiddenException('Inactive or invalid tenant membership');
  }
  if (!RolesGuard.hasPermission(membership.role.rolePermissions.map(p => p.permission.code), permission)) {
    throw new ForbiddenException('Missing permission: ' + permission);
  }
}

function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export async function mutation(prisma: PrismaService, context: TenantContext, permission: string,
  action: string, key: string | undefined, payload: unknown, work: (tx: Prisma.TransactionClient) => Promise<any>) {
  if (key !== undefined && (typeof key !== 'string' || !key.trim() || key.length > 200)) {
    throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
  }
  const requestHash = createHash('sha256').update(canonical({ action, payload })).digest('hex');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await authorize(tx, context, permission);
        const identity = { organizationId: context.organizationId, userId: context.userId, key: key! };
        if (key) {
          const prior = await tx.salesOperation.findUnique({ where: { organizationId_userId_key: identity } });
          if (prior) {
            if (prior.requestHash !== requestHash) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
            return prior.response;
          }
        }
        const result = JSON.parse(JSON.stringify(await work(tx)));
        if (key) await tx.salesOperation.create({ data: { ...identity, requestHash, response: result } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error: any) {
      const retryable = ['P2034', 'P2002'].includes(error.code) ||
        (error.code === 'P2010' && ['40001', '40P01'].includes(error.meta?.code));
      if (!retryable) throw error;
      if (attempt === 3) throw new ConflictException('CONCURRENT_OPERATION_RETRY');
    }
  }
}

export async function audit(tx: Prisma.TransactionClient, context: TenantContext, entityName: string,
  entityId: string, action: string, changes: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { organizationId: context.organizationId, userId: context.userId,
    entityName, entityId, action, changes } });
}
