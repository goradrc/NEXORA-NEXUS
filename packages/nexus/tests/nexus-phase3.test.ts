import { TenantContext, AuditService } from '@nexora/core';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { StockService } from '../../../apps/api/src/modules/nexus/stock/stock.service';
import { ExpensesService } from '../../../apps/api/src/modules/nexus/expenses/expenses.service';
import { EmployeesService } from '../../../apps/api/src/modules/nexus/employees/employees.service';
import { MovementType, PaymentMethod } from '../src';
import { NexoraLocalDatabase } from '../../../apps/web/src/offline/db';

describe('NEXORA NEXUS — Phase 3 Test Suite (Stocks, Dépenses & RH)', () => {
  const tenantA: TenantContext = { organizationId: 'org-tenant-A', userId: 'usr-1' };
  const tenantB: TenantContext = { organizationId: 'org-tenant-B', userId: 'usr-2' };

  const permsAdmin = ['nexus:catalog:read', 'nexus:catalog:create', 'nexus:stock:read', 'nexus:stock:create', 'nexus:expenses:read', 'nexus:expenses:create', 'nexus:expenses:update', 'nexus:employees:read', 'nexus:employees:create', 'nexus:employees:update'];
  const permsReadOnly = ['nexus:stock:read', 'nexus:expenses:read', 'nexus:employees:read'];

  beforeEach(() => {
    StockService.clearStoreForTesting();
    ExpensesService.clearStoreForTesting();
    EmployeesService.clearStoreForTesting();
  });

  describe('1. Stock Management Engine', () => {
    let prodAId: string;

    beforeEach(() => {
      // Seed a category and product for Tenant A
      const cat = CatalogService.createCategory(tenantA, { name: 'Hardware', type: 'PRODUCT' }, permsAdmin);
      const prod = CatalogService.createProductService(
        tenantA,
        {
          categoryId: cat.id,
          type: 'PRODUCT',
          reference: 'PROD-STOCK-01',
          name: 'Industrial Router',
          salePrice: 150,
          purchaseCost: 100,
          currentStock: 10,
          minStockAlert: 5,
        },
        permsAdmin
      );
      prodAId = prod.id;
    });

    it('should process Stock IN movement and increase current stock', () => {
      const movement = StockService.createMovement(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          productId: prodAId,
          type: MovementType.IN,
          quantity: 20,
          unitCost: 95,
          reason: 'Initial supplier delivery',
        },
        permsAdmin
      );

      expect(movement.id).toBeDefined();
      expect(movement.quantity).toEqual(20);

      const products = CatalogService.getProductsServices(tenantA, permsAdmin);
      const prod = products.find(p => p.id === prodAId);
      expect(prod?.currentStock).toEqual(30); // 10 + 20
    });

    it('should process Stock OUT movement and decrease current stock', () => {
      StockService.createMovement(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          productId: prodAId,
          type: MovementType.OUT,
          quantity: 4,
          unitCost: 100,
          reason: 'Customer order fulfillment',
        },
        permsAdmin
      );

      const products = CatalogService.getProductsServices(tenantA, permsAdmin);
      const prod = products.find(p => p.id === prodAId);
      expect(prod?.currentStock).toEqual(6); // 10 - 4
    });

    it('should throw error when Stock OUT exceeds current available stock', () => {
      expect(() => {
        StockService.createMovement(
          tenantA,
          {
            organizationId: tenantA.organizationId,
            productId: prodAId,
            type: MovementType.OUT,
            quantity: 50,
            unitCost: 100,
          },
          permsAdmin
        );
      }).toThrow('INSUFFICIENT_STOCK');
    });

    it('should detect stock threshold alert when stock falls below minStockAlert', () => {
      // Reduce stock down to 3 (minStockAlert is 5)
      StockService.createMovement(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          productId: prodAId,
          type: MovementType.OUT,
          quantity: 7,
          unitCost: 100,
        },
        permsAdmin
      );

      const alerts = StockService.getStockAlerts(tenantA, permsAdmin);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].productId).toEqual(prodAId);
      expect(alerts[0].currentStock).toEqual(3);
      expect(alerts[0].deficitQuantity).toEqual(2); // 5 - 3
    });

    it('should enforce strict multi-tenant isolation for stock movements and alerts', () => {
      StockService.createMovement(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          productId: prodAId,
          type: MovementType.IN,
          quantity: 5,
          unitCost: 100,
        },
        permsAdmin
      );

      const movementsA = StockService.getMovements(tenantA, permsAdmin);
      const movementsB = StockService.getMovements(tenantB, permsAdmin);

      expect(movementsA).toHaveLength(1);
      expect(movementsB).toHaveLength(0);
    });

    it('should record audit log on stock movement creation', () => {
      StockService.createMovement(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          productId: prodAId,
          type: MovementType.IN,
          quantity: 10,
          unitCost: 100,
        },
        permsAdmin
      );

      const logs = AuditService.getLogs(tenantA.organizationId);
      const stockLog = logs.find(l => l.entityName === 'StockMovement');
      expect(stockLog).toBeDefined();
      expect(stockLog?.action).toEqual('CREATE');
    });
  });

  describe('2. Expenses Management Engine', () => {
    it('should create, update and query expenses for tenant', () => {
      const exp = ExpensesService.createExpense(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          categoryId: 'cat-office',
          supplierId: 'sup-001',
          description: 'Office supplies paper & ink',
          amount: 250,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
        },
        permsAdmin
      );

      expect(exp.id).toBeDefined();
      expect(exp.amount).toEqual(250);

      const updated = ExpensesService.updateExpense(
        tenantA,
        exp.id,
        { amount: 300, description: 'Office supplies paper & ink (updated)' },
        permsAdmin
      );
      expect(updated.amount).toEqual(300);

      const totalA = ExpensesService.getTotalExpenses(tenantA, permsAdmin);
      expect(totalA).toEqual(300);

      const totalB = ExpensesService.getTotalExpenses(tenantB, permsAdmin);
      expect(totalB).toEqual(0);
    });

    it('should enforce RBAC permission on expense modification', () => {
      const exp = ExpensesService.createExpense(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          categoryId: 'cat-office',
          description: 'Internet subscription',
          amount: 80,
          paymentMethod: PaymentMethod.CASH,
        },
        permsAdmin
      );

      expect(() => {
        ExpensesService.updateExpense(tenantA, exp.id, { amount: 100 }, permsReadOnly);
      }).toThrow('FORBIDDEN_PERMISSION');
    });
  });

  describe('3. Employee / HR Management Engine', () => {
    it('should create employee record and prevent duplicate employee numbers per organization', () => {
      const emp1 = EmployeesService.createEmployee(
        tenantA,
        {
          organizationId: tenantA.organizationId,
          employeeNumber: 'EMP-001',
          firstName: 'Alice',
          lastName: 'Smith',
          position: 'Senior Engineer',
          email: 'alice@nexora.io',
        },
        permsAdmin
      );

      expect(emp1.id).toBeDefined();
      expect(emp1.employeeNumber).toEqual('EMP-001');

      // Attempting duplicate in same organization should fail
      expect(() => {
        EmployeesService.createEmployee(
          tenantA,
          {
            organizationId: tenantA.organizationId,
            employeeNumber: 'EMP-001',
            firstName: 'Bob',
            lastName: 'Jones',
            position: 'Developer',
          },
          permsAdmin
        );
      }).toThrow('DUPLICATE_EMPLOYEE_NUMBER');

      // Same employee number in a different organization should succeed
      const empB = EmployeesService.createEmployee(
        tenantB,
        {
          organizationId: tenantB.organizationId,
          employeeNumber: 'EMP-001',
          firstName: 'Charlie',
          lastName: 'Brown',
          position: 'Accountant',
        },
        permsAdmin
      );
      expect(empB.organizationId).toEqual(tenantB.organizationId);
    });
  });

  describe('4. Offline-First Synchronization Database', () => {
    it('should save mutations offline and apply local state optimistic updates', async () => {
      const localDb = new NexoraLocalDatabase();

      localDb.products.push({
        id: 'prod-local-1',
        organizationId: tenantA.organizationId,
        reference: 'LOCAL-SKU-1',
        name: 'Local Product',
        salePrice: 100,
        currentStock: 50,
        minStockAlert: 10,
      });

      const mutation = await localDb.saveSyncMutation({
        id: 'mut-uuid-1',
        organizationId: tenantA.organizationId,
        entityType: 'StockMovement',
        entityId: 'mov-local-1',
        operation: 'INSERT',
        payload: {
          id: 'mov-local-1',
          organizationId: tenantA.organizationId,
          productId: 'prod-local-1',
          type: 'IN',
          quantity: 25,
          unitCost: 80,
          createdAt: new Date().toISOString(),
        },
      });

      expect(mutation.status).toEqual('PENDING');

      // Check optimistic update in local database
      expect(localDb.stockMovements).toHaveLength(1);
      expect(localDb.products[0].currentStock).toEqual(75); // 50 + 25

      const pending = localDb.getPendingMutations(tenantA.organizationId);
      expect(pending).toHaveLength(1);

      localDb.markSynced([mutation.id]);
      expect(localDb.getPendingMutations(tenantA.organizationId)).toHaveLength(0);
    });
  });
});
