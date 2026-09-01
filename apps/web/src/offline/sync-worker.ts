import { localDb, NexoraLocalDatabase } from './db';

export interface SyncApiAdapter {
  pushBatch(tenantContext: { organizationId: string; userId: string }, batch: any): Promise<any>;
  pullDeltas(tenantContext: { organizationId: string; userId: string }, sinceTimestamp?: string): Promise<any[]>;
}

export class OfflineSyncWorker {
  private isSyncing = false;
  private isOnline = true;

  constructor(
    private db: NexoraLocalDatabase = localDb,
    private apiAdapter?: SyncApiAdapter
  ) {}

  public setOnlineStatus(online: boolean): void {
    this.isOnline = online;
  }

  public async syncNow(tenantContext: { organizationId: string; userId: string; deviceId: string }, permissions: string[]): Promise<{
    pushedCount: number;
    syncedIds: string[];
    hasError: boolean;
  }> {
    if (!this.isOnline) {
      return { pushedCount: 0, syncedIds: [], hasError: true };
    }

    if (this.isSyncing) {
      return { pushedCount: 0, syncedIds: [], hasError: false };
    }

    this.isSyncing = true;

    try {
      const pendingMutations = this.db.getPendingMutations(tenantContext.organizationId);

      if (pendingMutations.length === 0) {
        this.isSyncing = false;
        return { pushedCount: 0, syncedIds: [], hasError: false };
      }

      const batch = {
        deviceId: tenantContext.deviceId,
        mutations: pendingMutations.map(m => ({
          mutationId: m.id,
          entityType: m.entityType,
          entityId: m.entityId,
          operation: m.operation,
          payload: m.payload,
          clientTimestamp: m.clientTimestamp,
        })),
      };

      if (this.apiAdapter) {
        const result = await this.apiAdapter.pushBatch(tenantContext, batch);
        if (result && result.processedMutationIds) {
          this.db.markSynced(result.processedMutationIds);
          this.isSyncing = false;
          return {
            pushedCount: result.appliedCount || 0,
            syncedIds: result.processedMutationIds,
            hasError: false,
          };
        }
      }

      this.isSyncing = false;
      return { pushedCount: 0, syncedIds: [], hasError: false };
    } catch (error) {
      this.isSyncing = false;
      return { pushedCount: 0, syncedIds: [], hasError: true };
    }
  }
}
