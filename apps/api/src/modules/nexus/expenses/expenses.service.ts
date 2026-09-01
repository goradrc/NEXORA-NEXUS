import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CreateExpenseDto, UpdateExpenseDto, PaymentMethod } from '@nexora/nexus';

export interface ExpenseRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  supplierId?: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  receiptUrl?: string;
  expenseDate: Date;
  createdAt: Date;
}

export class ExpensesService {
  private static expensesStore: ExpenseRecord[] = [];

  public static getExpenses(
    tenantContext: TenantContext,
    userPermissions: string[],
    categoryId?: string
  ): ExpenseRecord[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:expenses:read');
    return this.expensesStore.filter(
      e => e.organizationId === tenantContext.organizationId && (!categoryId || e.categoryId === categoryId)
    );
  }

  public static createExpense(
    tenantContext: TenantContext,
    dto: CreateExpenseDto,
    userPermissions: string[]
  ): ExpenseRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:expenses:create');

    if (dto.amount <= 0) {
      throw new Error('INVALID_AMOUNT: Expense amount must be greater than zero');
    }

    const newExpense: ExpenseRecord = {
      id: `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      categoryId: dto.categoryId,
      supplierId: dto.supplierId,
      description: dto.description,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      receiptUrl: dto.receiptUrl,
      expenseDate: dto.expenseDate || new Date(),
      createdAt: new Date(),
    };

    this.expensesStore.push(newExpense);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Expense',
      entityId: newExpense.id,
      changes: {
        amount: dto.amount,
        categoryId: dto.categoryId,
        supplierId: dto.supplierId,
      },
    });

    return newExpense;
  }

  public static updateExpense(
    tenantContext: TenantContext,
    expenseId: string,
    dto: UpdateExpenseDto,
    userPermissions: string[]
  ): ExpenseRecord {
    RolesGuard.enforcePermission(userPermissions, 'nexus:expenses:update');
    const expense = this.expensesStore.find(
      e => e.id === expenseId && e.organizationId === tenantContext.organizationId
    );

    if (!expense) {
      throw new Error('EXPENSE_NOT_FOUND: Target expense does not exist for this tenant');
    }

    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new Error('INVALID_AMOUNT: Expense amount must be greater than zero');
      expense.amount = dto.amount;
    }
    if (dto.categoryId) expense.categoryId = dto.categoryId;
    if (dto.supplierId) expense.supplierId = dto.supplierId;
    if (dto.description) expense.description = dto.description;
    if (dto.paymentMethod) expense.paymentMethod = dto.paymentMethod;
    if (dto.receiptUrl !== undefined) expense.receiptUrl = dto.receiptUrl;
    if (dto.expenseDate) expense.expenseDate = dto.expenseDate;

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'UPDATE',
      entityName: 'Expense',
      entityId: expense.id,
      changes: dto,
    });

    return expense;
  }

  public static getTotalExpenses(
    tenantContext: TenantContext,
    userPermissions: string[]
  ): number {
    RolesGuard.enforcePermission(userPermissions, 'nexus:expenses:read');
    return this.expensesStore
      .filter(e => e.organizationId === tenantContext.organizationId)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  public static clearStoreForTesting(): void {
    this.expensesStore = [];
  }
}
