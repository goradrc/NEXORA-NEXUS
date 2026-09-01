import { TenantContext } from '@nexora/core';
import { StockService } from '../modules/nexus/stock/stock.service';
import { ExpensesService } from '../modules/nexus/expenses/expenses.service';
import { EmployeesService } from '../modules/nexus/employees/employees.service';
import { OpenApiRegistry } from '../openapi/openapi.doc';

export class OperationsController {
  // Stock Movements
  public static getStockMovements(tenantContext: TenantContext, permissions: string[], productId?: string) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/stock/movements',
      method: 'GET',
      summary: 'List stock movements',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:stock:read'],
      responses: { 200: 'Movements list' },
    });
    return StockService.getMovements(tenantContext, permissions, productId);
  }

  public static createStockMovement(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/stock/movements',
      method: 'POST',
      summary: 'Record stock movement (IN, OUT, ADJUSTMENT)',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:stock:create'],
      responses: { 201: 'Movement recorded' },
    });
    return StockService.createMovement(tenantContext, dto, permissions);
  }

  public static getStockAlerts(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/stock/alerts',
      method: 'GET',
      summary: 'List products below minStockAlert',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:stock:read'],
      responses: { 200: 'Low stock alerts' },
    });
    return StockService.getStockAlerts(tenantContext, permissions);
  }

  // Expenses
  public static getExpenses(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/expenses',
      method: 'GET',
      summary: 'List expenses',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:expenses:read'],
      responses: { 200: 'Expenses list' },
    });
    return ExpensesService.getExpenses(tenantContext, permissions);
  }

  public static createExpense(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/expenses',
      method: 'POST',
      summary: 'Record new expense',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:expenses:create'],
      responses: { 201: 'Expense created' },
    });
    return ExpensesService.createExpense(tenantContext, dto, permissions);
  }

  // Employees
  public static getEmployees(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/employees',
      method: 'GET',
      summary: 'List organization employees',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:employees:read'],
      responses: { 200: 'Employees list' },
    });
    return EmployeesService.getEmployees(tenantContext, permissions);
  }

  public static createEmployee(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/employees',
      method: 'POST',
      summary: 'Create employee record',
      tags: ['Operations'],
      security: true,
      requiredPermissions: ['nexus:employees:create'],
      responses: { 201: 'Employee created' },
    });
    return EmployeesService.createEmployee(tenantContext, dto, permissions);
  }
}
