import { TenantContext } from '@nexora/core';
import { SuppliersService } from '../../../apps/api/src/modules/nexus/suppliers/suppliers.service';

describe('NEXORA NEXUS — Phase FRONT-5 / Étape 1 Test Suite (Suppliers & Purchasing Foundations)', () => {
  const tenant1: TenantContext = {
    organizationId: 'org-1',
    userId: 'usr-sup-1',
  };

  const tenant2: TenantContext = {
    organizationId: 'org-2',
    userId: 'usr-sup-2',
  };

  const fullPermissions = [
    'nexus:suppliers:read',
    'nexus:suppliers:write',
  ];

  beforeEach(() => {
    SuppliersService.clearAllForTesting();
  });

  describe('1. CRUD Fournisseurs (Suppliers)', () => {
    it('1. should create a supplier with automatic code generation FOURN-001', () => {
      const supplier = SuppliersService.create(
        tenant1,
        {
          name: 'Fournisseur Global SAS',
          companyName: 'Global Hardware',
          contactName: 'Alice Martin',
          email: 'contact@global-hardware.com',
          phone: '+33 1 23 45 67 89',
          address: '45 Avenue des Usines, Lyon',
          taxNumber: 'FR987654321',
          paymentTerms: '30 NET',
        },
        fullPermissions
      );

      expect(supplier.id).toBeDefined();
      expect(supplier.organizationId).toBe('org-1');
      expect(supplier.code).toBe('FOURN-001');
      expect(supplier.name).toBe('Fournisseur Global SAS');
      expect(supplier.status).toBe('ACTIVE');
      expect(supplier.balanceDue).toBe(0);
    });

    it('2. should retrieve a supplier by ID using findOne', () => {
      const created = SuppliersService.create(
        tenant1,
        { name: 'Fournisseur Composants' },
        fullPermissions
      );

      const found = SuppliersService.findOne(tenant1, created.id, fullPermissions);
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Fournisseur Composants');
    });

    it('3. should list suppliers strictly filtered by tenant organizationId', () => {
      SuppliersService.create(tenant1, { name: 'Fournisseur T1-A' }, fullPermissions);
      SuppliersService.create(tenant1, { name: 'Fournisseur T1-B' }, fullPermissions);
      SuppliersService.create(tenant2, { name: 'Fournisseur T2-A' }, fullPermissions);

      const t1List = SuppliersService.findAll(tenant1, fullPermissions);
      const t2List = SuppliersService.findAll(tenant2, fullPermissions);

      expect(t1List.length).toBe(2);
      expect(t2List.length).toBe(1);
      expect(t1List.every((s) => s.organizationId === 'org-1')).toBe(true);
      expect(t2List.every((s) => s.organizationId === 'org-2')).toBe(true);
    });

    it('4. should update supplier information cleanly', () => {
      const created = SuppliersService.create(
        tenant1,
        { name: 'Nom Initial', phone: '0100000000' },
        fullPermissions
      );

      const updated = SuppliersService.update(
        tenant1,
        created.id,
        { name: 'Nom Mis À Jour', phone: '0199999999', notes: 'Fournisseur VIP' },
        fullPermissions
      );

      expect(updated.name).toBe('Nom Mis À Jour');
      expect(updated.phone).toBe('0199999999');
      expect(updated.notes).toBe('Fournisseur VIP');
    });

    it('5. should toggle supplier status between ACTIVE and INACTIVE without physical deletion', () => {
      const created = SuppliersService.create(
        tenant1,
        { name: 'Fournisseur Temporaire' },
        fullPermissions
      );

      expect(created.status).toBe('ACTIVE');

      // Toggle to INACTIVE
      const deactivated = SuppliersService.toggleStatus(tenant1, created.id, fullPermissions);
      expect(deactivated.status).toBe('INACTIVE');

      // Toggle back to ACTIVE
      const reactivated = SuppliersService.toggleStatus(tenant1, created.id, fullPermissions);
      expect(reactivated.status).toBe('ACTIVE');

      // Verify supplier remains in store (no physical deletion)
      const list = SuppliersService.findAll(tenant1, fullPermissions);
      expect(list.length).toBe(1);
    });

    it('6. should enforce data validation on name and email format', () => {
      // Empty name -> error
      expect(() => {
        SuppliersService.create(tenant1, { name: '   ' }, fullPermissions);
      }).toThrow(/INVALID_SUPPLIER_NAME/);

      // Invalid email -> error
      expect(() => {
        SuppliersService.create(
          tenant1,
          { name: 'Test Fournisseur', email: 'invalid-email-format' },
          fullPermissions
        );
      }).toThrow(/INVALID_EMAIL_FORMAT/);
    });
  });

  describe('2. RBAC Backend Enforcement', () => {
    it('7. should enforce nexus:suppliers:read permission on findAll and findOne', () => {
      const created = SuppliersService.create(tenant1, { name: 'Supplier RBAC' }, fullPermissions);

      expect(() => {
        SuppliersService.findAll(tenant1, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        SuppliersService.findOne(tenant1, created.id, []);
      }).toThrow(/FORBIDDEN_PERMISSION/);
    });

    it('8. should enforce nexus:suppliers:write permission on create, update, and toggleStatus', () => {
      expect(() => {
        SuppliersService.create(tenant1, { name: 'Unauthorized Create' }, ['nexus:suppliers:read']);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      const created = SuppliersService.create(tenant1, { name: 'Valid Supplier' }, fullPermissions);

      expect(() => {
        SuppliersService.update(tenant1, created.id, { name: 'Unauthorized Edit' }, ['nexus:suppliers:read']);
      }).toThrow(/FORBIDDEN_PERMISSION/);

      expect(() => {
        SuppliersService.toggleStatus(tenant1, created.id, ['nexus:suppliers:read']);
      }).toThrow(/FORBIDDEN_PERMISSION/);
    });
  });

  describe('3. Multi-Tenant Isolation Strict', () => {
    it('9. should prevent Tenant 1 from reading Tenant 2 supplier by ID', () => {
      const s2 = SuppliersService.create(tenant2, { name: 'Secret Supplier T2' }, fullPermissions);

      expect(() => {
        SuppliersService.findOne(tenant1, s2.id, fullPermissions);
      }).toThrow(/SUPPLIER_NOT_FOUND/);
    });

    it('10. should prevent Tenant 1 from updating or toggling Tenant 2 supplier', () => {
      const s2 = SuppliersService.create(tenant2, { name: 'Supplier T2' }, fullPermissions);

      expect(() => {
        SuppliersService.update(tenant1, s2.id, { name: 'Hacked Name' }, fullPermissions);
      }).toThrow(/SUPPLIER_NOT_FOUND/);

      expect(() => {
        SuppliersService.toggleStatus(tenant1, s2.id, fullPermissions);
      }).toThrow(/SUPPLIER_NOT_FOUND/);
    });
  });
});
