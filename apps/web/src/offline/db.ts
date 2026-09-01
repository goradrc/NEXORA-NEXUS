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
  minStockAlert: number;
}

export interface LocalStockMovement {
  id: string;
  organizationId: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  unitCost: number;
  createdAt: string;
}

export interface LocalExpense {
  id: string;
  organizationId: string;
  categoryId: string;
  supplierId?: string;
  description: string;
  amount: number;
  paymentMethod: string;
  expenseDate: string;
}

export interface LocalEmployee {
  id: string;
  organizationId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string;
  status: string;
}

export interface LocalLineItem {
  id: string;
  productServiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
  totalPrice: number;
}

export interface LocalQuote {
  id: string;
  organizationId: string;
  customerId: string;
  quoteNumber: string;
  status: string;
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  lineItems: LocalLineItem[];
  createdAt: string;
}

export interface LocalInvoice {
  id: string;
  organizationId: string;
  customerId: string;
  quoteId?: string;
  invoiceNumber: string;
  status: string;
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  lineItems: LocalLineItem[];
  createdAt: string;
}

export interface LocalPayment {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceId: string;
  paymentNumber: string;
  amount: number;
  paymentMethod: string;
  createdAt: string;
}

export class NexoraLocalDatabase {
  public syncQueue: LocalSyncQueueItem[] = [];
  public customers: LocalCustomer[] = [];
  public products: LocalProduct[] = [];
  public stockMovements: LocalStockMovement[] = [];
  public expenses: LocalExpense[] = [];
  public employees: LocalEmployee[] = [];
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

    // Apply mutation locally for instant UI update (offline-first)
    this.applyLocalMutation(item.entityType, item.operation, item.payload);

    return queueItem;
  }

  private applyLocalMutation(
    entityType: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: Record<string, any>
  ): void {
    if (entityType === 'StockMovement' && operation === 'INSERT') {
      this.stockMovements.push(payload as LocalStockMovement);
      const product = this.products.find(p => p.id === payload.productId);
      if (product) {
        if (payload.type === 'IN') product.currentStock += payload.quantity;
        else if (payload.type === 'OUT') product.currentStock -= payload.quantity;
        else if (payload.type === 'ADJUSTMENT') product.currentStock = payload.quantity;
      }
    } else if (entityType === 'Expense' && operation === 'INSERT') {
      this.expenses.push(payload as LocalExpense);
    } else if (entityType === 'Employee' && operation === 'INSERT') {
      this.employees.push(payload as LocalEmployee);
    } else if (entityType === 'Quote' && operation === 'INSERT') {
      this.quotes.push(payload as LocalQuote);
    } else if (entityType === 'Invoice' && operation === 'INSERT') {
      this.invoices.push(payload as LocalInvoice);
    } else if (entityType === 'Payment' && operation === 'INSERT') {
      this.payments.push(payload as LocalPayment);
      const invoice = this.invoices.find(i => i.id === payload.invoiceId);
      if (invoice) {
        invoice.amountPaid += payload.amount;
        invoice.amountDue = Math.max(0, invoice.totalAmount - invoice.amountPaid);
        invoice.status = invoice.amountDue === 0 ? 'PAID' : 'PARTIAL';
      }
    }
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
    this.stockMovements = [];
    this.expenses = [];
    this.employees = [];
    this.quotes = [];
    this.invoices = [];
    this.payments = [];
  }
}

export const localDb = new NexoraLocalDatabase();
