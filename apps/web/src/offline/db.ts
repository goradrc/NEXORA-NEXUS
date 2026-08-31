// NEXORA Offline-First Dexie (IndexedDB) Database Schema

export interface LocalSyncQueueItem {
  id: string; // UUID v4
  organizationId: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  clientTimestamp: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface LocalCustomer {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  balance: number;
}

export interface LocalProduct {
  id: string;
  organizationId: string;
  reference: string;
  name: string;
  salePrice: number;
  currentStock: number;
}

export class NexoraLocalDatabase {
  public syncQueue: LocalSyncQueueItem[] = [];
  public customers: LocalCustomer[] = [];
  public products: LocalProduct[] = [];

  public async saveSyncMutation(item: Omit<LocalSyncQueueItem, 'clientTimestamp' | 'status'>): Promise<LocalSyncQueueItem> {
    const queueItem: LocalSyncQueueItem = {
      ...item,
      clientTimestamp: new Date().toISOString(),
      status: 'PENDING',
    };
    this.syncQueue.push(queueItem);
    return queueItem;
  }

  public getPendingMutations(organizationId: string): LocalSyncQueueItem[] {
    return this.syncQueue.filter(
      (q) => q.organizationId === organizationId && q.status === 'PENDING'
    );
  }
}

export const localDb = new NexoraLocalDatabase();
