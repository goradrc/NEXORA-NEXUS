import { SuppliersService } from '../../../apps/api/src/modules/nexus/suppliers/suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from '@nexora/nexus';

describe('NEXORA NEXUS — Suppliers Module Test Suite', () => {
  const tenantOrg1 = { organizationId: 'org-1', userId: 'usr-1' };
  const tenantOrg2 = { organizationId: 'org-2', userId: 'usr-2' };
  const fullPermissions = ['nexus:suppliers:read', 'nexus:suppliers:create', 'nexus:suppliers:update', 'nexus:suppliers:delete'];

  describe('1. Supplier Creation & Auto-Code Generation', () => {
    it('should create a valid supplier with auto-generated FOURN code', () => {
      const dto: CreateSupplierDto = {
        name: 'Alpha Hardware Corp',
        companyName: 'Alpha Hardware Ltd',
        email: 'contact@alphahardware.com',
        phone: '+33123456789',
        address: '10 Rue de la Paix, Paris',
        taxNumber: 'FR12345678901',
        paymentTerms: '30 NET',
      };

      const created = SuppliersService.create(tenantOrg1, dto, fullPermissions);

      expect(created.id).toBeDefined();
      expect(created.organizationId).toEqual('org-1');
      expect(created.code).toMatch(/^FOURN-\d{3}$/);
      expect(created.name).toEqual('Alpha Hardware Corp');
      expect(created.status).toEqual('ACTIVE');
      expect(created.balanceDue).toEqual(0);
    });

    it('should preserve custom supplier code when provided', () => {
      const dto: CreateSupplierDto = {
        code: 'FOURN-CUSTOM-001',
        name: 'Custom Supplier Inc',
      };

      const created = SuppliersService.create(tenantOrg1, dto, fullPermissions);
      expect(created.code).toEqual('FOURN-CUSTOM-001');
    });
  });

  describe('2. Multi-Tenant Reading & Isolation', () => {
    it('should isolate suppliers strictly by organizationId', () => {
      const supplier1 = SuppliersService.create(tenantOrg1, { name: 'Org1 Supplier' }, fullPermissions);
      const supplier2 = SuppliersService.create(tenantOrg2, { name: 'Org2 Supplier' }, fullPermissions);

      const org1Suppliers = SuppliersService.findAll(tenantOrg1, fullPermissions);
      const org2Suppliers = SuppliersService.findAll(tenantOrg2, fullPermissions);

      expect(org1Suppliers.some(s => s.id === supplier1.id)).toBe(true);
      expect(org1Suppliers.some(s => s.id === supplier2.id)).toBe(false);

      expect(org2Suppliers.some(s => s.id === supplier2.id)).toBe(true);
      expect(org2Suppliers.some(s => s.id === supplier1.id)).toBe(false);
    });

    it('should throw error when accessing another tenant supplier detail (Cross-Tenant)', () => {
      const supplierOrg2 = SuppliersService.create(tenantOrg2, { name: 'Org2 Private Supplier' }, fullPermissions);

      expect(() => {
        SuppliersService.findOne(tenantOrg1, supplierOrg2.id, fullPermissions);
      }).toThrow('SUPPLIER_NOT_FOUND');
    });
  });

  describe('3. Supplier Update & Soft Status Management', () => {
    it('should update supplier commercial details cleanly', () => {
      const supplier = SuppliersService.create(tenantOrg1, { name: 'Initial Name' }, fullPermissions);
      const updateDto: UpdateSupplierDto = {
        name: 'Updated Name Corp',
        paymentTerms: '60 NET',
      };

      const updated = SuppliersService.update(tenantOrg1, supplier.id, updateDto, fullPermissions);

      expect(updated.name).toEqual('Updated Name Corp');
      expect(updated.paymentTerms).toEqual('60 NET');
    });

    it('should toggle supplier status between ACTIVE and INACTIVE without physical deletion', () => {
      const supplier = SuppliersService.create(tenantOrg1, { name: 'Soft Delete Test Supplier' }, fullPermissions);
      expect(supplier.status).toEqual('ACTIVE');

      // Soft delete -> set INACTIVE
      const deactivated = SuppliersService.toggleStatus(tenantOrg1, supplier.id, 'INACTIVE', fullPermissions);
      expect(deactivated.status).toEqual('INACTIVE');

      // Re-activate -> set ACTIVE
      const reactivated = SuppliersService.toggleStatus(tenantOrg1, supplier.id, 'ACTIVE', fullPermissions);
      expect(reactivated.status).toEqual('ACTIVE');

      // Confirm supplier is still present in database list
      const list = SuppliersService.findAll(tenantOrg1, fullPermissions);
      expect(list.some(s => s.id === supplier.id)).toBe(true);
    });
  });

  describe('4. RBAC Permission Enforcement', () => {
    it('should deny read operation if user lacks nexus:suppliers:read permission', () => {
      expect(() => {
        SuppliersService.findAll(tenantOrg1, ['nexus:other:permission']);
      }).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should deny create operation if user lacks nexus:suppliers:create permission', () => {
      expect(() => {
        SuppliersService.create(tenantOrg1, { name: 'Unauthorized' }, ['nexus:suppliers:read']);
      }).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should deny update operation if user lacks nexus:suppliers:update permission', () => {
      const supplier = SuppliersService.create(tenantOrg1, { name: 'Auth Test' }, fullPermissions);
      expect(() => {
        SuppliersService.update(tenantOrg1, supplier.id, { name: 'New Name' }, ['nexus:suppliers:read']);
      }).toThrow('FORBIDDEN_PERMISSION');
    });
  });
});
