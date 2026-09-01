import { TenantContext } from '@nexora/core';
import { AuthController } from '../../../apps/api/src/controllers/auth.controller';
import { ReferentialsController } from '../../../apps/api/src/controllers/referentials.controller';
import { OperationsController } from '../../../apps/api/src/controllers/operations.controller';
import { SalesController } from '../../../apps/api/src/controllers/sales.controller';
import { SyncController } from '../../../apps/api/src/controllers/sync.controller';
import { OpenApiRegistry } from '../../../apps/api/src/openapi/openapi.doc';
import { SyncService } from '../../../apps/api/src/modules/core/sync/sync.service';
import { StockService } from '../../../apps/api/src/modules/nexus/stock/stock.service';
import { CatalogService } from '../../../apps/api/src/modules/nexus/catalog/catalog.service';
import { NexoraLocalDatabase } from '../../../apps/web/src/offline/db';
import { OfflineSyncWorker, SyncApiAdapter } from '../../../apps/web/src/offline/sync-worker';

describe('NEXORA NEXUS — Mouvement A Test Suite (Consolidation API REST, OpenAPI & Sync Delta)', () => {
  const tenantA: TenantContext = { organizationId: 'org-tenant-A', userId: 'usr-1' };
  const tenantB: TenantContext = { organizationId: 'org-tenant-B', userId: 'usr-2' };

  const permsAdmin = [
    'nexus:catalog:read', 'nexus:catalog:create',
    'nexus:stock:read', 'nexus:stock:create',
    'nexus:expenses:read', 'nexus:expenses:create',
    'nexus:employees:read', 'nexus:employees:create',
    'nexus:quotes:read', 'nexus:quotes:create',
    'nexus:invoices:read', 'nexus:invoices:create',
    'nexus:payments:read', 'nexus:payments:create',
  ];

  beforeEach(() => {
    OpenApiRegistry.clearForTesting();
    SyncService.clearForTesting();
    StockService.clearStoreForTesting();
  });

  describe('1. OpenAPI Specification & REST Controllers Layer', () => {
    it('should generate valid OpenAPI 3.0 specification from registered routes', () => {
      AuthController.login('admin@nexora.io', 'Password123!');
      ReferentialsController.getCategories(tenantA, permsAdmin);
      OperationsController.getStockMovements(tenantA, permsAdmin);
      SalesController.getInvoices(tenantA, permsAdmin);
      SyncController.pushMutations(tenantA, { deviceId: 'dev-001', mutations: [] }, permsAdmin);

      const spec = OpenApiRegistry.getSpec();

      expect(spec.openapi).toEqual('3.0.0');
      expect(spec.info.title).toEqual('NEXORA NEXUS Platform API');
      expect(spec.paths['/api/v1/auth/login']).toBeDefined();
      expect(spec.paths['/api/v1/catalog/categories']).toBeDefined();
      expect(spec.paths['/api/v1/stock/movements']).toBeDefined();
      expect(spec.paths['/api/v1/sales/invoices']).toBeDefined();
      expect(spec.paths['/api/v1/sync/push']).toBeDefined();
    });

    it('should authenticate user login and extract tenant context from Bearer JWT token', () => {
      const authResult = AuthController.login('admin@nexora.io', 'Password123!');
      expect(authResult.accessToken).toBeDefined();

      const extractedContext = AuthController.getTenantContext(`Bearer ${authResult.accessToken}`);
      expect(extractedContext.userId).toEqual('usr-123');
    });

    it('should reject requests with missing or invalid Bearer token', () => {
      expect(() => {
        AuthController.getTenantContext('InvalidHeaderToken');
      }).toThrow('UNAUTHORIZED');
    });
  });

  describe('2. Bidirectional Sync Engine & Idempotency', () => {
    let catId: string;
    let prodId: string;

    beforeEach(() => {
      const cat = CatalogService.createCategory(tenantA, { name: 'Hardware', type: 'PRODUCT' }, permsAdmin);
      catId = cat.id;
      const prod = CatalogService.createProductService(
        tenantA,
        {
          categoryId: catId,
          type: 'PRODUCT',
          reference: 'PROD-SYNC-01',
          name: 'Sync Router',
          salePrice: 200,
          purchaseCost: 120,
          currentStock: 10,
        },
        permsAdmin
      );
      prodId = prod.id;
    });

    it('should process batch mutations and ignore duplicate push requests (idempotency)', () => {
      const batchPayload = {
        deviceId: 'device-mobile-001',
        mutations: [
          {
            mutationId: 'mut-001',
            entityType: 'StockMovement',
            entityId: 'mov-001',
            operation: 'INSERT' as const,
            payload: {
              organizationId: tenantA.organizationId,
              productId: prodId,
              type: 'IN',
              quantity: 15,
              unitCost: 120,
            },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      };

      // First Push
      const result1 = SyncController.pushMutations(tenantA, batchPayload, permsAdmin);
      expect(result1.appliedCount).toEqual(1);
      expect(result1.processedMutationIds).toContain('mut-001');

      // Duplicate Push (Idempotency test)
      const result2 = SyncController.pushMutations(tenantA, batchPayload, permsAdmin);
      expect(result2.appliedCount).toEqual(0); // Deduplicated, not re-applied
      expect(result2.processedMutationIds).toContain('mut-001');

      // Stock should have been increased exactly ONCE (+15 -> 25)
      const prod = CatalogService.getProductsServices(tenantA, permsAdmin).find(p => p.id === prodId);
      expect(prod?.currentStock).toEqual(25);
    });

    it('should extract server deltas on pull request for specific tenant', () => {
      SyncController.pushMutations(
        tenantA,
        {
          deviceId: 'device-002',
          mutations: [
            {
              mutationId: 'mut-expense-1',
              entityType: 'Expense',
              entityId: 'exp-001',
              operation: 'INSERT',
              payload: {
                categoryId: 'cat-office',
                description: 'Office Snacks',
                amount: 45,
                paymentMethod: 'CASH',
              },
              clientTimestamp: new Date().toISOString(),
            },
          ],
        },
        permsAdmin
      );

      const deltasA = SyncController.pullDeltas(tenantA);
      expect(deltasA).toHaveLength(1);
      expect(deltasA[0].entityType).toEqual('Expense');

      // Tenant B should not receive Tenant A deltas
      const deltasB = SyncController.pullDeltas(tenantB);
      expect(deltasB).toHaveLength(0);
    });
  });

  describe('3. Offline Sync Worker Client Simulation & Network Recovery', () => {
    it('should handle network disconnection, queue mutations, and sync upon reconnection', async () => {
      const localDb = new NexoraLocalDatabase();

      const apiAdapter: SyncApiAdapter = {
        pushBatch: async (tc, batch) => {
          return SyncController.pushMutations(tc as TenantContext, batch, permsAdmin);
        },
        pullDeltas: async (tc, since) => {
          return SyncController.pullDeltas(tc as TenantContext, since);
        },
      };

      const worker = new OfflineSyncWorker(localDb, apiAdapter);

      // Simulate offline state
      worker.setOnlineStatus(false);

      await localDb.saveSyncMutation({
        id: 'mut-offline-001',
        organizationId: tenantA.organizationId,
        entityType: 'Expense',
        entityId: 'exp-off-1',
        operation: 'INSERT',
        payload: {
          categoryId: 'cat-off',
          description: 'Offline Fuel Receipt',
          amount: 60,
          paymentMethod: 'CASH',
        },
      });

      // Try sync while offline -> should fail gracefully and keep in pending queue
      const syncOffline = await worker.syncNow(
        { organizationId: tenantA.organizationId, userId: tenantA.userId, deviceId: 'dev-web-1' },
        permsAdmin
      );

      expect(syncOffline.hasError).toBe(true);
      expect(localDb.getPendingMutations(tenantA.organizationId)).toHaveLength(1);

      // Reconnect network
      worker.setOnlineStatus(true);

      const syncOnline = await worker.syncNow(
        { organizationId: tenantA.organizationId, userId: tenantA.userId, deviceId: 'dev-web-1' },
        permsAdmin
      );

      expect(syncOnline.hasError).toBe(false);
      expect(syncOnline.pushedCount).toEqual(1);
      expect(localDb.getPendingMutations(tenantA.organizationId)).toHaveLength(0);
    });
  });
});
