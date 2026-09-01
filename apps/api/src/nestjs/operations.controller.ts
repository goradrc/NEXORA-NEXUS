import { Controller, Get, Post, Body, Headers, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OperationsController as CoreOperationsController } from '../controllers/operations.controller';
import { AuthController as AuthCoreController } from '../controllers/auth.controller';

@ApiTags('Operations')
@ApiBearerAuth()
@Controller('api/v1')
export class NestOperationsController {
  @Get('stock/movements')
  @ApiOperation({ summary: 'List stock movements' })
  getStockMovements(@Headers('authorization') authHeader: string, @Query('productId') productId?: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.getStockMovements(tenantCtx, ['nexus:stock:read'], productId);
  }

  @Post('stock/movements')
  @ApiOperation({ summary: 'Record stock movement' })
  createStockMovement(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.createStockMovement(tenantCtx, dto, ['nexus:stock:create', 'nexus:catalog:read']);
  }

  @Get('stock/alerts')
  @ApiOperation({ summary: 'List low stock alerts' })
  getStockAlerts(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.getStockAlerts(tenantCtx, ['nexus:stock:read', 'nexus:catalog:read']);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'List expenses' })
  getExpenses(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.getExpenses(tenantCtx, ['nexus:expenses:read']);
  }

  @Post('expenses')
  @ApiOperation({ summary: 'Record expense' })
  createExpense(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.createExpense(tenantCtx, dto, ['nexus:expenses:create']);
  }

  @Get('employees')
  @ApiOperation({ summary: 'List employees' })
  getEmployees(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.getEmployees(tenantCtx, ['nexus:employees:read']);
  }

  @Post('employees')
  @ApiOperation({ summary: 'Create employee record' })
  createEmployee(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreOperationsController.createEmployee(tenantCtx, dto, ['nexus:employees:create']);
  }
}
