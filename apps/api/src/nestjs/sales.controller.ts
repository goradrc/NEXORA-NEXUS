import { Controller, Get, Post, Body, Headers, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SalesController as CoreSalesController } from '../controllers/sales.controller';
import { AuthController as AuthCoreController } from '../controllers/auth.controller';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('api/v1/sales')
export class NestSalesController {
  @Get('quotes')
  @ApiOperation({ summary: 'List sales quotes' })
  getQuotes(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.getQuotes(tenantCtx, ['nexus:quotes:read']);
  }

  @Post('quotes')
  @ApiOperation({ summary: 'Create sales quote / proforma' })
  createQuote(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.createQuote(tenantCtx, dto, ['nexus:quotes:create']);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List sales invoices' })
  getInvoices(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.getInvoices(tenantCtx, ['nexus:invoices:read']);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create sales invoice with stock deduction' })
  createInvoice(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.createInvoice(tenantCtx, dto, ['nexus:invoices:create', 'nexus:catalog:read', 'nexus:stock:create']);
  }

  @Post('quotes/:id/convert')
  @ApiOperation({ summary: 'Convert accepted quote to invoice' })
  convertQuoteToInvoice(@Headers('authorization') authHeader: string, @Param('id') quoteId: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.convertQuoteToInvoice(tenantCtx, quoteId, ['nexus:quotes:read', 'nexus:quotes:update', 'nexus:invoices:create', 'nexus:catalog:read', 'nexus:stock:create']);
  }

  @Get('payments')
  @ApiOperation({ summary: 'List payments' })
  getPayments(@Headers('authorization') authHeader: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.getPayments(tenantCtx, ['nexus:payments:read']);
  }

  @Post('payments')
  @ApiOperation({ summary: 'Record payment for invoice' })
  createPayment(@Headers('authorization') authHeader: string, @Body() dto: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.createPayment(tenantCtx, dto, ['nexus:payments:create', 'nexus:invoices:read', 'nexus:customers:read', 'nexus:customers:update']);
  }

  @Get('invoices/:id/pdf')
  @ApiOperation({ summary: 'Generate HTML/PDF invoice document string' })
  getInvoicePdfHtml(@Headers('authorization') authHeader: string, @Param('id') invoiceId: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSalesController.getInvoicePdfHtml(tenantCtx, invoiceId, ['nexus:invoices:read', 'nexus:customers:read']);
  }
}
