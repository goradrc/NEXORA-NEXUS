import { TenantContext } from '@nexora/core';
import { CatalogService } from '../modules/nexus/catalog/catalog.service';
import { CustomersService } from '../modules/nexus/customers/customers.service';
import { SuppliersService } from '../modules/nexus/suppliers/suppliers.service';
import { OpenApiRegistry } from '../openapi/openapi.doc';

export class ReferentialsController {
  public static getCategories(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/catalog/categories',
      method: 'GET',
      summary: 'List catalog categories',
      tags: ['Referentials'],
      security: true,
      requiredPermissions: ['nexus:catalog:read'],
      responses: { 200: 'Categories list' },
    });
    return CatalogService.getCategories(tenantContext, permissions);
  }

  public static getProducts(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/catalog/products',
      method: 'GET',
      summary: 'List products and services',
      tags: ['Referentials'],
      security: true,
      requiredPermissions: ['nexus:catalog:read'],
      responses: { 200: 'Products list' },
    });
    return CatalogService.getProductsServices(tenantContext, permissions);
  }

  public static createProduct(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/catalog/products',
      method: 'POST',
      summary: 'Create product or service',
      tags: ['Referentials'],
      security: true,
      requiredPermissions: ['nexus:catalog:create'],
      responses: { 201: 'Product created' },
    });
    return CatalogService.createProductService(tenantContext, dto, permissions);
  }

  public static getCustomers(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/customers',
      method: 'GET',
      summary: 'List CRM customers',
      tags: ['Referentials'],
      security: true,
      requiredPermissions: ['nexus:customers:read'],
      responses: { 200: 'Customers list' },
    });
    return CustomersService.findAll(tenantContext, permissions);
  }

  public static createCustomer(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/customers',
      method: 'POST',
      summary: 'Create CRM customer',
      tags: ['Referentials'],
      security: true,
      requiredPermissions: ['nexus:customers:create'],
      responses: { 201: 'Customer created' },
    });
    return CustomersService.create(tenantContext, dto, permissions);
  }

  public static getSuppliers(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/suppliers',
      method: 'GET',
      summary: 'List suppliers',
      tags: ['Referentials'],
      security: true,
      requiredPermissions: ['nexus:suppliers:read'],
      responses: { 200: 'Suppliers list' },
    });
    return SuppliersService.findAll(tenantContext, permissions);
  }
}
