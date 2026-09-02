export type CatalogType = 'PRODUCT' | 'SERVICE';

export interface CategoryDto {
  id: string;
  organizationId: string;
  name: string;
  type: 'PRODUCT' | 'SERVICE' | 'EXPENSE';
}

export interface CreateCategoryDto {
  name: string;
  type: 'PRODUCT' | 'SERVICE' | 'EXPENSE';
}

export interface ProductServiceDto {
  id: string;
  organizationId: string;
  categoryId: string;
  defaultSupplierId?: string;
  type: CatalogType;
  reference: string;
  name: string;
  description?: string;
  salePrice: number;
  purchaseCost: number;
  taxRate: number;
  currentStock: number;
  minStockAlert: number;
  unit: string;
}

export interface CreateProductServiceDto {
  categoryId: string;
  defaultSupplierId?: string;
  type: CatalogType;
  reference: string;
  name: string;
  description?: string;
  salePrice: number;
  purchaseCost?: number;
  taxRate?: number;
  currentStock?: number;
  minStockAlert?: number;
  unit?: string;
}

export interface UpdateProductServiceDto {
  categoryId?: string;
  defaultSupplierId?: string;
  name?: string;
  description?: string;
  salePrice?: number;
  purchaseCost?: number;
  taxRate?: number;
  minStockAlert?: number;
  unit?: string;
}
