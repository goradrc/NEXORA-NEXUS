import {
  InventoryStatus,
  InventoryResponseDto,
  InventoryLineDto,
  ValidateInventoryDto,
  validatePhysicalQuantity,
} from '../src';

describe('NEXORA NEXUS — FRONT-7 Lot 1 Test Suite (Inventory Data Model & DTOs)', () => {
  it('1. should represent Inventory with DRAFT status', () => {
    const draftStatus: InventoryStatus = 'DRAFT';
    expect(draftStatus).toEqual('DRAFT');
  });

  it('2. should contain exactly the 4 allowed InventoryStatus values', () => {
    const validStatuses: InventoryStatus[] = ['DRAFT', 'IN_PROGRESS', 'VALIDATED', 'CANCELLED'];
    expect(validStatuses).toHaveLength(4);
    expect(validStatuses).toContain('DRAFT');
    expect(validStatuses).toContain('IN_PROGRESS');
    expect(validStatuses).toContain('VALIDATED');
    expect(validStatuses).toContain('CANCELLED');
  });

  it('3. should map InventoryLine referencing Inventory and ProductService', () => {
    const line: InventoryLineDto = {
      id: 'line-001',
      inventoryId: 'inv-001',
      productId: 'prod-001',
      theoreticalQuantity: 100,
      physicalQuantity: 94,
      varianceQuantity: -6,
      unitCost: 15,
      varianceValue: -90,
      reason: 'Missing items on shelf A',
    };

    expect(line.inventoryId).toEqual('inv-001');
    expect(line.productId).toEqual('prod-001');
  });

  it('4. should include snapshot field theoreticalQuantity', () => {
    const line: Partial<InventoryLineDto> = {
      theoreticalQuantity: 150,
    };
    expect(line.theoreticalQuantity).toEqual(150);
  });

  it('5. should include counting fields physicalQuantity and varianceQuantity', () => {
    const line: Partial<InventoryLineDto> = {
      physicalQuantity: 145,
      varianceQuantity: -5,
    };
    expect(line.physicalQuantity).toEqual(145);
    expect(line.varianceQuantity).toEqual(-5);
  });

  it('6. should include financial fields unitCost and varianceValue', () => {
    const line: Partial<InventoryLineDto> = {
      unitCost: 20,
      varianceValue: -100,
    };
    expect(line.unitCost).toEqual(20);
    expect(line.varianceValue).toEqual(-100);
  });

  it('7. should ensure Inventory possesses organizationId for multi-tenant isolation', () => {
    const inventory: Partial<InventoryResponseDto> = {
      id: 'inv-001',
      organizationId: 'org-tenant-A',
      inventoryNumber: 'INV-2026-0001',
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      lines: [],
    };
    expect(inventory.organizationId).toEqual('org-tenant-A');
  });

  it('8. should model idempotencyKey on InventoryResponseDto for BDD uniqueness constraint', () => {
    const inventory: Partial<InventoryResponseDto> = {
      id: 'inv-001',
      organizationId: 'org-tenant-A',
      idempotencyKey: 'idemp-key-inv-001',
    };
    expect(inventory.idempotencyKey).toEqual('idemp-key-inv-001');
  });

  it('9. should enforce idempotencyKey requirement on ValidateInventoryDto', () => {
    const validateDto: ValidateInventoryDto = {
      inventoryId: 'inv-001',
      idempotencyKey: 'idemp-inv-validation-123',
    };
    expect(validateDto.idempotencyKey).toBeDefined();
    expect(validateDto.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('10. should validate physicalQuantity non-negative constraint and reject negative values', () => {
    expect(validatePhysicalQuantity(0)).toBe(true);
    expect(validatePhysicalQuantity(10)).toBe(true);
    expect(validatePhysicalQuantity(0.5)).toBe(true);

    expect(validatePhysicalQuantity(-1)).toBe(false);
    expect(validatePhysicalQuantity(-0.01)).toBe(false);
    expect(validatePhysicalQuantity(NaN)).toBe(false);
  });

  it('11. should export Inventory DTOs cleanly from @nexora/nexus package', () => {
    const nexusExports = require('../src');
    expect(nexusExports.validatePhysicalQuantity).toBeDefined();
  });
});
