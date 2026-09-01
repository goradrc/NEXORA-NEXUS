import { Controller, Get, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReferentialsController as CoreReferentialsController } from '../controllers/referentials.controller';
import { AuthController as AuthCoreController } from '../controllers/auth.controller';

@ApiTags('Referentials')
@ApiBearerAuth()
@Controller('api/v1')
export class NestReferentialsController {
  @Get('catalog/categories')
  @ApiOperation({ summary: 'List catalog categories' })
  getCategories(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreReferentialsController.getCategories(tenantCtx, ['nexus:catalog:read']);
  }

  @Get('catalog/products')
  @ApiOperation({ summary: 'List products and services' })
  getProducts(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreReferentialsController.getProducts(tenantCtx, ['nexus:catalog:read']);
  }

  @Post('catalog/products')
  @ApiOperation({ summary: 'Create product or service' })
  createProduct(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreReferentialsController.createProduct(tenantCtx, dto, ['nexus:catalog:create']);
  }

  @Get('customers')
  @ApiOperation({ summary: 'List CRM customers' })
  getCustomers(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreReferentialsController.getCustomers(tenantCtx, ['nexus:customers:read']);
  }

  @Post('customers')
  @ApiOperation({ summary: 'Create CRM customer' })
  createCustomer(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreReferentialsController.createCustomer(tenantCtx, dto, ['nexus:customers:create']);
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'List suppliers' })
  getSuppliers(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreReferentialsController.getSuppliers(tenantCtx, ['nexus:suppliers:read']);
  }
}
