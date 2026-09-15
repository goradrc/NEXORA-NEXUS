import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { CreateInvoiceDto, UpdateInvoiceDto } from '@nexora/nexus';
import { InvoicesService } from './invoices.service';
import { SalesAuthGuard } from '../delivery-notes/sales-auth.guard';

@Controller('nexus/invoices')
@UseGuards(SalesAuthGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  list(@Req() req: any, @Query('offset') offset?: string) {
    return this.service.list(req.tenantContext, offset === undefined ? 0 : Number(offset));
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.service.get(req.tenantContext, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateInvoiceDto, @Headers('idempotency-key') key?: string) {
    return this.service.create(req.tenantContext, dto, key);
  }

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @Headers('idempotency-key') key?: string
  ) {
    return this.service.update(req.tenantContext, id, dto, key);
  }

  @Post(':id/issue')
  issue(@Req() req: any, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.service.issueInvoice(req.tenantContext, id, key);
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @Headers('idempotency-key') key?: string
  ) {
    return this.service.cancelInvoice(req.tenantContext, id, reason, key);
  }
}
