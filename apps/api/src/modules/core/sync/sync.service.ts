import { TenantContext, AuditService } from '@nexora/core';
import { StockService } from '../../nexus/stock/stock.service';
import { ExpensesService } from '../../nexus/expenses/expenses.service';
import { EmployeesService } from '../../nexus/employees/employees.service';
import { QuotesService } from '../../nexus/quotes/quotes.service';
import { InvoicesService } from '../../nexus/invoices/invoices.service';
import { PaymentsService } from '../../nexus/payments/payments.service';

export interface SyncPushBatchDto {
  deviceId: string;
  mutations: Array<{
    mutationId: string;
    entityType: string;
    entityId: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: Record<string, any>;
    clientTimestamp: string;
  }>;
}

export interface SyncResultDto {
  appliedCount: number;
  processedMutationIds: string[];
  conflicts: Array<{ mutationId: string; reason: string }>;
  serverTimestamp: string;
}

export class SyncService {
  private static processedMutationIds: Set<string> = new Set();
  private static deltaJournal: Array<{
    organizationId: string;
    entityType: string;
    entityId: string;
    payload: Record<string, any>;
    serverTimestamp: Date;
  }> = [];

  public static processPushBatch(
    tenantContext: TenantContext,
    batch: SyncPushBatchDto,
    userPermissions: string[]
  ): SyncResultDto {
    const orgId = tenantContext.organizationId;
    const processedIds: string[] = [];
    const conflicts: Array<{ mutationId: string; reason: string }> = [];
    let appliedCount = 0;

    for (const mut of batch.mutations) {
      // 1. Idempotency Check
      const deduplicationKey = `${batch.deviceId}:${mut.mutationId}`;
      if (this.processedMutationIds.has(deduplicationKey)) {
        processedIds.push(mut.mutationId);
        continue; // Already applied safely without side effects
      }

      try {
        // 2. Conflict Detection & Execution
        this.applyMutation(tenantContext, mut, userPermissions);
        this.processedMutationIds.add(deduplicationKey);
        processedIds.push(mut.mutationId);
        appliedCount++;

        // Journal for delta pull
        const now = new Date();
        this.deltaJournal.push({
          organizationId: orgId,
          entityType: mut.entityType,
          entityId: mut.entityId,
          payload: mut.payload,
          serverTimestamp: now,
        });

        AuditService.log({
          organizationId: orgId,
          userId: tenantContext.userId,
          action: 'CREATE',
          entityName: `SyncBatch:${mut.entityType}`,
          entityId: mut.mutationId,
          changes: { operation: mut.operation, deviceId: batch.deviceId },
        });
      } catch (err: any) {
        conflicts.push({
          mutationId: mut.mutationId,
          reason: err.message || 'MUTATION_FAILED',
        });
      }
    }

    return {
      appliedCount,
      processedMutationIds: processedIds,
      conflicts,
      serverTimestamp: new Date().toISOString(),
    };
  }

  private static applyMutation(
    tenantContext: TenantContext,
    mut: SyncPushBatchDto['mutations'][0],
    permissions: string[]
  ): void {
    const p = mut.payload;
    p.organizationId = tenantContext.organizationId;

    if (mut.entityType === 'StockMovement' && mut.operation === 'INSERT') {
      StockService.createMovement(tenantContext, p as any, permissions);
    } else if (mut.entityType === 'Expense' && mut.operation === 'INSERT') {
      ExpensesService.createExpense(tenantContext, p as any, permissions);
    } else if (mut.entityType === 'Employee' && mut.operation === 'INSERT') {
      EmployeesService.createEmployee(tenantContext, p as any, permissions);
    } else if (mut.entityType === 'Quote' && mut.operation === 'INSERT') {
      QuotesService.createQuote(tenantContext, p as any, permissions);
    } else if (mut.entityType === 'Invoice' && mut.operation === 'INSERT') {
      InvoicesService.createInvoice(tenantContext, p as any, permissions);
    } else if (mut.entityType === 'Payment' && mut.operation === 'INSERT') {
      PaymentsService.createPayment(tenantContext, p as any, permissions);
    }
  }

  public static getDeltas(
    tenantContext: TenantContext,
    sinceTimestamp?: string
  ): Array<{ entityType: string; entityId: string; payload: Record<string, any>; serverTimestamp: string }> {
    const sinceDate = sinceTimestamp ? new Date(sinceTimestamp) : new Date(0);

    return this.deltaJournal
      .filter(
        d => d.organizationId === tenantContext.organizationId && d.serverTimestamp > sinceDate
      )
      .map(d => ({
        entityType: d.entityType,
        entityId: d.entityId,
        payload: d.payload,
        serverTimestamp: d.serverTimestamp.toISOString(),
      }));
  }

  public static clearForTesting(): void {
    this.processedMutationIds.clear();
    this.deltaJournal = [];
  }
}
