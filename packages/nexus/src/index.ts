export interface ProductServiceDto {
  id: string;
  organizationId: string;
  categoryId?: string;
  defaultSupplierId?: string;
  type: 'PRODUCT' | 'SERVICE';
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

export interface CreateProductServiceDto {
  categoryId?: string;
  defaultSupplierId?: string;
  type: 'PRODUCT' | 'SERVICE';
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

export interface CategoryDto {
  id: string;
  organizationId: string;
  name: string;
  type: 'PRODUCT' | 'SERVICE';
}

export interface CreateCategoryDto {
  name: string;
  type: 'PRODUCT' | 'SERVICE';
}

export * from './customers/customers.dto';
export * from './customers/customers.service';
export * from './suppliers/suppliers.service';
