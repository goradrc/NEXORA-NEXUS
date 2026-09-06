import { TenantContext } from '@nexora/core';
import { SupplierDto, CreateSupplierDto, UpdateSupplierDto, SupplierStatus } from '@nexora/nexus';
import { SuppliersService } from './suppliers.service';

export class SuppliersController {
  public static getAll(tenantContext: TenantContext, permissions: string[]): SupplierDto[] {
    return SuppliersService.findAll(tenantContext, permissions);
  }

  public static getOne(tenantContext: TenantContext, id: string, permissions: string[]): SupplierDto {
    return SuppliersService.findOne(tenantContext, id, permissions);
  }

  public static create(tenantContext: TenantContext, dto: CreateSupplierDto, permissions: string[]): SupplierDto {
    return SuppliersService.create(tenantContext, dto, permissions);
  }

  public static update(tenantContext: TenantContext, id: string, dto: UpdateSupplierDto, permissions: string[]): SupplierDto {
    return SuppliersService.update(tenantContext, id, dto, permissions);
  }

  public static toggleStatus(
    tenantContext: TenantContext,
    id: string,
    status: SupplierStatus,
    permissions: string[]
  ): SupplierDto {
    return SuppliersService.toggleStatus(tenantContext, id, status, permissions);
  }
}
