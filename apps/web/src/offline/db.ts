// NEXORA Offline-First Dexie (IndexedDB) Database Schema & Sync Engine
import {
  QuoteDto,
  InvoiceDto,
  DeliveryNoteDto,
  PaymentDto,
  LineItemDto,
  QuoteStatus,
  InvoiceStatus,
  DeliveryStatus,
  PaymentMethod,
} from '@nexora/nexus';

export type LocalQuote = QuoteDto;
export type LocalInvoice = InvoiceDto;
export type LocalDeliveryNote = DeliveryNoteDto;
export type LocalPayment = PaymentDto;
export type LocalLineItem = LineItemDto;

export type { QuoteStatus, InvoiceStatus, DeliveryStatus, PaymentMethod };

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
  email?: string;
  phone?: string;
  companyName?: string;
  balance: number;
}

export interface LocalProduct {
  id: string;
  organizationId: string;
  reference: string;
  name: string;
  salePrice: number;
  taxRate?: number;
  currentStock: number;
  minStockAlert: number;
}

export class NexoraLocalDatabase {
  public syncQueue: LocalSyncQueueItem[] = [];
  public customers: LocalCustomer[] = [];
  public products: LocalProduct[] = [];
  public quotes: LocalQuote[] = [];
  public invoices: LocalInvoice[] = [];
  public payments: LocalPayment[] = [];

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
    this.products = [];
    this.quotes = [];
    this.invoices = [];
    this.payments = [];
  }
}

export const localDb = new NexoraLocalDatabase();
