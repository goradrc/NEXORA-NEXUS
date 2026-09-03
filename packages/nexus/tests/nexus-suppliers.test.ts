import { SuppliersService } from '../src/suppliers/suppliers.service';

describe('SuppliersService (Étape B3 - Fournisseurs)', () => {
  let service: SuppliersService;

  const mockUserOrg1 = {
    id: 'user-1',
    organizationId: 'org-1',
    permissions: ['*'],
  };

  const mockUserOrg2 = {
    id: 'user-2',
    organizationId: 'org-2',
    permissions: ['*'],
  };

  const mockUserRestricted = {
    id: 'user-3',
    organizationId: 'org-1',
    permissions: ['nexus:other'],
  };

  beforeEach(() => {
    service = new SuppliersService();
  });

  test('should list default suppliers for organization org-1', () => {
    const list = service.getSuppliers(mockUserOrg1);
    expect(list.length).toBe(2);
    expect(list[0].code).toBe('FRN-001');
    expect(list[1].code).toBe('FRN-002');
  });

  test('should search suppliers by query string', () => {
    const list = service.getSuppliers(mockUserOrg1, { search: 'papeterie' });
    expect(list.length).toBe(1);
    expect(list[0].companyName).toContain('Papeterie');
  });

  test('should create a new supplier with auto-generated code', () => {
    const newSupplier = service.createSupplier(mockUserOrg1, {
      name: 'Fournisseur Composants',
      companyName: 'Electro Components Inc',
      email: 'sales@electro.com',
      payableBalance: 1200.5,
    });

    expect(newSupplier.code).toBe('FRN-003');
    expect(newSupplier.name).toBe('Fournisseur Composants');
    expect(newSupplier.payableBalance).toBe(1200.5);

    const list = service.getSuppliers(mockUserOrg1);
    expect(list.length).toBe(3);
  });

  test('should update an existing supplier', () => {
    const updated = service.updateSupplier(mockUserOrg1, 'sup-1', {
      payableBalance: 5000.0,
      phone: '+33 1 99 88 77 66',
    });

    expect(updated.payableBalance).toBe(5000.0);
    expect(updated.phone).toBe('+33 1 99 88 77 66');
  });

  test('should delete a supplier', () => {
    const res = service.deleteSupplier(mockUserOrg1, 'sup-2');
    expect(res.success).toBe(true);

    const list = service.getSuppliers(mockUserOrg1);
    expect(list.length).toBe(1);
  });

  test('should enforce multi-tenant isolation', () => {
    const listOrg2 = service.getSuppliers(mockUserOrg2);
    expect(listOrg2.length).toBe(0);

    expect(() => service.getSupplierById(mockUserOrg2, 'sup-1')).toThrow(
      /Access denied to this supplier/,
    );
  });

  test('should enforce RBAC permissions', () => {
    expect(() => service.getSuppliers(mockUserRestricted)).toThrow(
      /FORBIDDEN_PERMISSION: Missing required permission \[nexus:suppliers:read\]/,
    );
  });
});
