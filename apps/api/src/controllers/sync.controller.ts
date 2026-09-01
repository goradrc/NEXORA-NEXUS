import { TenantContext } from '@nexora/core';
import { SyncService, SyncPushBatchDto } from '../modules/core/sync/sync.service';
import { OpenApiRegistry } from '../openapi/openapi.doc';

export class SyncController {
  public static pushMutations(tenantContext: TenantContext, batch: SyncPushBatchDto, userPermissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sync/push',
      method: 'POST',
      summary: 'Push batch offline mutations to server with idempotency',
      tags: ['Synchronization'],
      security: true,
      responses: { 200: 'Mutations processed and synced' },
    });

    return SyncService.processPushBatch(tenantContext, batch, userPermissions);
  }

  public static pullDeltas(tenantContext: TenantContext, sinceTimestamp?: string) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sync/pull',
      method: 'GET',
      summary: 'Pull server deltas since client last sync timestamp',
      tags: ['Synchronization'],
      security: true,
      responses: { 200: 'Delta records list' },
    });

    return SyncService.getDeltas(tenantContext, sinceTimestamp);
  }
}
