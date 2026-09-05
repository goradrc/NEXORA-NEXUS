// NEXORA Offline-First Dexie (IndexedDB) Database Schema & Sync Engine

export interface LocalSyncQueueItem {
  id: string; // UUID
  organizationId: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  clientTimestamp: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
}

export interface LocalCustomer {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  balance: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalCategory {
  id: string;
  organizationId: string;
  name: string;
  type: 'PRODUCT' | 'SERVICE' | 'EXPENSE';
}

export interface LocalProduct {
  id: string;
  organizationId: string;
  categoryId: string;
  defaultSupplierId?: string;
  type: 'PRODUCT' | 'SERVICE';
  reference: string;
  name: string;
  description?: string;
  salePrice: number;
  purchaseCost: number;
  taxRate: number;
  currentStock: number;
  minStockAlert: number;
  unit: string;
}

export class NexoraLocalDatabase {
  public syncQueue: LocalSyncQueueItem[] = [];
  public customers: LocalCustomer[] = [];
  public categories: LocalCategory[] = [];
  public products: LocalProduct[] = [];

  constructor() {
    // Initial mock data for testing/offline fallback
    this.customers = [
      {
        id: 'cli-001',
        organizationId: 'org-1',
        code: 'CLI-001',
        name: 'Client Alpha',
        companyName: 'Alpha Tech',
        email: 'alpha@client.com',
        phone: '+33 1 23 45 67 89',
        address: '12 Rue de la Paix',
        city: 'Paris',
        taxNumber: 'FR123456789',
        balance: 1500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    this.categories = [
      { id: 'cat-001', organizationId: 'org-1', name: 'Électronique & Matériel', type: 'PRODUCT' },
      { id: 'cat-002', organizationId: 'org-1', name: 'Prestations de Conseil', type: 'SERVICE' },
    ];

    this.products = [
      {
        id: 'prod-001',
        organizationId: 'org-1',
        categoryId: 'cat-001',
        type: 'PRODUCT',
        reference: 'SKU-ELEC-01',
        name: 'Moniteur 4K IPS Pro',
        description: 'Écran professionnel 27 pouces 4K UHD',
        salePrice: 450,
        purchaseCost: 300,
        taxRate: 20,
        currentStock: 15,
        minStockAlert: 5,
        unit: 'PCE',
      },
    ];
  }

  public async saveSyncMutation(
    item: Omit<LocalSyncQueueItem, 'clientTimestamp' | 'status'>
  ): Promise<LocalSyncQueueItem> {
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

  public markSynced(mutationIds: string[]): void {
    for (const item of this.syncQueue) {
      if (mutationIds.includes(item.id)) {
        item.status = 'SYNCED';
      }
    }
  }

  public clearAllForTesting(): void {
    this.syncQueue = [];
    this.customers = [];
    this.categories = [];
    this.products = [];
  }
}

export const localDb = new NexoraLocalDatabase();
