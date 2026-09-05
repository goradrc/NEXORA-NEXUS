import { TenantContext } from '@nexora/core';
import { PurchaseOrderDto, CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from '@nexora/nexus';
import { PurchaseOrdersService } from './purchase-orders.service';

export class PurchaseOrdersController {
  public static getAll(tenantContext: TenantContext, permissions: string[]): PurchaseOrderDto[] {
    return PurchaseOrdersService.findAll(tenantContext, permissions);
  }

  public static getOne(tenantContext: TenantContext, id: string, permissions: string[]): PurchaseOrderDto {
    return PurchaseOrdersService.findOne(tenantContext, id, permissions);
  }

  public static create(tenantContext: TenantContext, dto: CreatePurchaseOrderDto, permissions: string[]): PurchaseOrderDto {
    return PurchaseOrdersService.create(tenantContext, dto, permissions);
  }

  public static update(tenantContext: TenantContext, id: string, dto: UpdatePurchaseOrderDto, permissions: string[]): PurchaseOrderDto {
    return PurchaseOrdersService.update(tenantContext, id, dto, permissions);
  }

  public static markOrdered(tenantContext: TenantContext, id: string, permissions: string[]): PurchaseOrderDto {
    return PurchaseOrdersService.markOrdered(tenantContext, id, permissions);
  }

  public static receive(tenantContext: TenantContext, id: string, permissions: string[]): PurchaseOrderDto {
    return PurchaseOrdersService.receive(tenantContext, id, permissions);
  }

  public static cancel(tenantContext: TenantContext, id: string, permissions: string[]): PurchaseOrderDto {
    return PurchaseOrdersService.cancel(tenantContext, id, permissions);
  }
}
