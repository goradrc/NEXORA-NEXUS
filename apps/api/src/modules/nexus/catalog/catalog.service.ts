import { TenantContext } from '@nexora/core';
import { RolesGuard } from '@nexora/core';
import { ProductServiceDto, CreateProductServiceDto, CategoryDto, CreateCategoryDto } from '@nexora/nexus';

export class CatalogService {
  private static categoriesStore: CategoryDto[] = [
    { id: 'cat-001', organizationId: 'org-1', name: 'Electronics', type: 'PRODUCT' },
    { id: 'cat-002', organizationId: 'org-1', name: 'Consulting Services', type: 'SERVICE' }
  ];

  private static catalogStore: ProductServiceDto[] = [
    {
      id: 'prod-001',
      organizationId: 'org-1',
      categoryId: 'cat-001',
      type: 'PRODUCT',
      reference: 'SKU-ELEC-01',
      name: 'Smart Workstation Monitor',
      description: '4K IPS Monitor',
      salePrice: 450,
      purchaseCost: 300,
      taxRate: 20,
      currentStock: 15,
      minStockAlert: 5,
      unit: 'PCE'
    }
  ];

  public static getCategories(tenantContext: TenantContext, userPermissions: string[]): CategoryDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:catalog:read');
    return this.categoriesStore.filter(c => c.organizationId === tenantContext.organizationId);
  }

  public static createCategory(tenantContext: TenantContext, dto: CreateCategoryDto, userPermissions: string[]): CategoryDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:catalog:create');
    const newCat: CategoryDto = {
      id: `cat-${crypto.randomUUID()}`,
      organizationId: tenantContext.organizationId,
      name: dto.name,
      type: dto.type
    };
    this.categoriesStore.push(newCat);
    return newCat;
  }

  public static getProductsServices(tenantContext: TenantContext, userPermissions: string[]): ProductServiceDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:catalog:read');
    return this.catalogStore.filter(p => p.organizationId === tenantContext.organizationId);
  }

  public static createProductService(
    tenantContext: TenantContext,
    dto: CreateProductServiceDto,
    userPermissions: string[]
  ): ProductServiceDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:catalog:create');
    const orgId = tenantContext.organizationId;

    const existingReference = this.catalogStore.find(
      p => p.organizationId === orgId && p.reference === dto.reference
    );

    let finalRef = dto.reference;
    if (existingReference) {
      finalRef = `${dto.reference}-CONFLICT-${Date.now().toString().slice(-4)}`;
    }

    const newItem: ProductServiceDto = {
      id: `item-${crypto.randomUUID()}`,
      organizationId: orgId,
      categoryId: dto.categoryId,
      defaultSupplierId: dto.defaultSupplierId,
      type: dto.type,
      reference: finalRef,
      name: dto.name,
      description: dto.description,
      salePrice: dto.salePrice,
      purchaseCost: dto.purchaseCost || 0,
      taxRate: dto.taxRate || 0,
      currentStock: dto.currentStock || 0,
      minStockAlert: dto.minStockAlert || 0,
      unit: dto.unit || 'PCE'
    };

    this.catalogStore.push(newItem);
    return newItem;
  }

  public static clearAllForTesting(): void {
    this.categoriesStore = [];
    this.catalogStore = [];
  }
}
