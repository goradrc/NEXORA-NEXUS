import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from '@nexora/nexus';
import { DeliveryNotesService } from './delivery-notes.service';
import { SalesAuthGuard } from './sales-auth.guard';

@Controller('nexus/delivery-notes')
@UseGuards(SalesAuthGuard)
export class DeliveryNotesController {
  constructor(private readonly service: DeliveryNotesService) {}
  @Get()
  list(@Req() req: any, @Query('offset') offset?: string) { return this.service.list(req.tenantContext, offset === undefined ? 0 : Number(offset)); }
  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) { return this.service.get(req.tenantContext, id); }
  @Post()
  create(@Req() req: any, @Body() dto: CreateDeliveryNoteDto, @Headers('idempotency-key') key?: string) {
    return this.service.create(req.tenantContext, dto, key);
  }
  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDeliveryNoteDto, @Headers('idempotency-key') key?: string) {
    return this.service.update(req.tenantContext, id, dto, key);
  }
  @Post(':id/ship')
  ship(@Req() req: any, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.service.transition(req.tenantContext, id, 'SHIPPED', key);
  }
  @Post(':id/deliver')
  deliver(@Req() req: any, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.service.transition(req.tenantContext, id, 'DELIVERED', key);
  }
  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.service.transition(req.tenantContext, id, 'CANCELLED', key);
  }
}

@Controller('nexus/invoices')
@UseGuards(SalesAuthGuard)
export class InvoiceIssueController {
  constructor(private readonly service: DeliveryNotesService) {}
  @Post(':id/issue')
  issue(@Req() req: any, @Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.service.issueInvoice(req.tenantContext, id, key);
  }
}
