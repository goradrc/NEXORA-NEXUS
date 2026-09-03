import { CustomersService } from '../src/customers/customers.service';

describe('NEXORA NEXUS — CRM Clients Module Test Suite', () => {
  const tenantOrg1 = { organizationId: 'org-1', userId: 'usr-1' };
  const tenantOrg2 = { organizationId: 'org-2', userId: 'usr-2' };

  const fullPermissions = [
    'nexus:customers:read',
    'nexus:customers:create',
    'nexus:customers:update',
    'nexus:customers:delete',
  ];

  describe('1. Multi-Tenant Isolation for Customers', () => {
    it('should return only customers belonging to the current organization', () => {
      const customersOrg1 = CustomersService.findAll(tenantOrg1, fullPermissions);
      expect(customersOrg1.length).toBeGreaterThan(0);
      expect(customersOrg1.every((c) => c.organizationId === 'org-1')).toBe(true);

      const customersOrg2 = CustomersService.findAll(tenantOrg2, fullPermissions);
      expect(customersOrg2.every((c) => c.organizationId === 'org-2')).toBe(true);
    });

    it('should prevent cross-tenant customer retrieval by ID', () => {
      expect(() => {
        CustomersService.findOne(tenantOrg1, 'cli-002', fullPermissions); // cli-002 belongs to org-2
      }).toThrow('CUSTOMER_NOT_FOUND');
    });
  });

  describe('2. RBAC Permissions Guard Enforcement', () => {
    it('should throw error when user lacks read permission', () => {
      expect(() => {
        CustomersService.findAll(tenantOrg1, ['nexus:other:permission']);
      }).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should throw error when user lacks create permission', () => {
      expect(() => {
        CustomersService.create(
          tenantOrg1,
          { name: 'Forbidden Client' },
          ['nexus:customers:read']
        );
      }).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should throw error when user lacks update permission', () => {
      expect(() => {
        CustomersService.update(
          tenantOrg1,
          'cli-001',
          { name: 'Updated Name' },
          ['nexus:customers:read']
        );
      }).toThrow('FORBIDDEN_PERMISSION');
    });

    it('should throw error when user lacks delete permission', () => {
      expect(() => {
        CustomersService.delete(tenantOrg1, 'cli-001', ['nexus:customers:read']);
      }).toThrow('FORBIDDEN_PERMISSION');
    });
  });

  describe('3. CRUD Operations', () => {
    let createdCustomerId: string;

    it('should create a new customer with auto-generated code and initial zero balance', () => {
      const newCustomer = CustomersService.create(
        tenantOrg1,
        {
          name: 'Acme Corporation',
          companyName: 'Acme Global',
          email: 'contact@acme.com',
          city: 'Paris',
        },
        fullPermissions
      );

      expect(newCustomer.id).toBeDefined();
      expect(newCustomer.organizationId).toEqual('org-1');
      expect(newCustomer.name).toEqual('Acme Corporation');
      expect(newCustomer.balance).toEqual(0);
      expect(newCustomer.code).toContain('CLI-');

      createdCustomerId = newCustomer.id;
    });

    it('should find the newly created customer by ID', () => {
      const found = CustomersService.findOne(tenantOrg1, createdCustomerId, fullPermissions);
      expect(found.name).toEqual('Acme Corporation');
    });

    it('should update existing customer details', () => {
      const updated = CustomersService.update(
        tenantOrg1,
        createdCustomerId,
        {
          name: 'Acme Corporation Ltd',
          balance: 250,
        },
        fullPermissions
      );

      expect(updated.name).toEqual('Acme Corporation Ltd');
      expect(updated.balance).toEqual(250);
    });

    it('should delete a customer', () => {
      const deleted = CustomersService.delete(tenantOrg1, createdCustomerId, fullPermissions);
      expect(deleted).toBe(true);

      expect(() => {
        CustomersService.findOne(tenantOrg1, createdCustomerId, fullPermissions);
      }).toThrow('CUSTOMER_NOT_FOUND');
    });
  });
});
