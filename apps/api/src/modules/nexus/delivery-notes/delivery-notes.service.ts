import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@nexora/core';
import type { CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from '@nexora/nexus';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/database.service';
import { audit, authorize, mutation } from './sales-transaction';
import { lines, metadata, object, quantities, textField } from './delivery-validation';
import { reconcileSalesStock } from './sales-stock';

@Injectable()
export class DeliveryNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(context: TenantContext, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('INVALID_OFFSET');
    return this.prisma.$transaction(async tx => {
      await authorize(tx, context, 'nexus:delivery-notes:read');
      return tx.deliveryNote.findMany({ where: { organizationId: context.organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: 100, include: { lineItems: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async get(context: TenantContext, id: string) {
    return this.prisma.$transaction(async tx => {
      await authorize(tx, context, 'nexus:delivery-notes:read');
      return this.find(tx, context, id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async find(tx: Prisma.TransactionClient, context: TenantContext, id: string) {
    const note = await tx.deliveryNote.findFirst({ where: { id, organizationId: context.organizationId }, include: { lineItems: true } });
    if (!note) throw new NotFoundException('Delivery note not found');
    return note;
  }

  private async validatedLines(tx: Prisma.TransactionClient, context: TenantContext, input: any,
    source: { customerId: string; invoiceId?: string | null; quoteId?: string | null }) {
    const normalized = lines(input);
    const where = { organizationId: context.organizationId };
    if (!await tx.customer.findFirst({ where: { ...where, id: source.customerId } })) throw new NotFoundException('Customer not found');
    for (const productServiceId of new Set(normalized.map(l => l.productServiceId))) {
      if (!await tx.productService.findFirst({ where: { ...where, id: productServiceId } })) throw new NotFoundException('Catalog item not found');
    }
    if (source.invoiceId) {
      const invoice = await tx.invoice.findFirst({ where: { ...where, id: source.invoiceId }, include: { lineItems: true } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.customerId !== source.customerId || invoice.status === 'CANCELLED' ||
          (source.quoteId && source.quoteId !== invoice.quoteId)) throw new ConflictException('INVALID_INVOICE_SOURCE');
      const available = quantities(invoice.lineItems);
      for (const [id, quantity] of quantities(normalized)) {
        if (quantity > (available.get(id) ?? 0)) throw new ConflictException('INVOICE_QUANTITY_EXCEEDED');
      }
    }
    if (source.quoteId) {
      const quote = await tx.quote.findFirst({ where: { ...where, id: source.quoteId } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.customerId !== source.customerId || !['ACCEPTED', 'CONVERTED'].includes(quote.status)) throw new ConflictException('INVALID_QUOTE_SOURCE');
    }
    return normalized.map(l => {
      // Shared Sales contract: line total is untaxed, with the discount applied.
      const totalPrice = new Prisma.Decimal(l.quantity).times(l.unitPrice)
        .times(new Prisma.Decimal(1).minus(new Prisma.Decimal(l.discountPercent).div(100)))
        .toDecimalPlaces(2).toNumber();
      if (!Number.isFinite(totalPrice) || totalPrice > Number.MAX_SAFE_INTEGER) throw new BadRequestException('LINE_TOTAL_OVERFLOW');
      return { ...l, totalPrice };
    });
  }

  async create(context: TenantContext, dto: CreateDeliveryNoteDto, key?: string) {
    object(dto, ['customerId', 'invoiceId', 'quoteId', 'shippingAddress', 'carrierName', 'trackingNumber', 'notes', 'lineItems', 'idempotencyKey']);
    textField(dto.customerId, true, 100);
    textField(dto.invoiceId, dto.invoiceId !== undefined, 100);
    textField(dto.quoteId, dto.quoteId !== undefined, 100);
    key = this.key(key, dto.idempotencyKey);
    if (!key) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    const details = metadata(dto);
    const { idempotencyKey: _key, ...payload } = dto;
    return mutation(this.prisma, context, 'nexus:delivery-notes:create', 'create', key, payload, async tx => {
      const lineItems = await this.validatedLines(tx, context, dto.lineItems, dto);
      const year = new Date().getUTCFullYear();
      const sequence = await tx.deliverySequence.upsert({
        where: { organizationId_year: { organizationId: context.organizationId, year } },
        create: { organizationId: context.organizationId, year, value: 1 }, update: { value: { increment: 1 } },
      });
      const note = await tx.deliveryNote.create({ data: { organizationId: context.organizationId,
        customerId: dto.customerId, invoiceId: dto.invoiceId, quoteId: dto.quoteId,
        deliveryNumber: `BL-${year}-${String(sequence.value).padStart(4, '0')}`, ...details,
        lineItems: { create: lineItems } }, include: { lineItems: true } });
      await audit(tx, context, 'DeliveryNote', note.id, 'CREATE', { after: JSON.parse(JSON.stringify(note)) });
      return note;
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateDeliveryNoteDto, key?: string) {
    object(dto, ['shippingAddress', 'carrierName', 'trackingNumber', 'notes', 'lineItems']);
    const details = metadata(dto);
    return mutation(this.prisma, context, 'nexus:delivery-notes:update', 'update:' + id, key, dto, async tx => {
      const existing = await this.find(tx, context, id);
      if (existing.status !== 'DRAFT') throw new ConflictException('DELIVERY_NOTE_LOCKED');
      const lineItems = dto.lineItems === undefined ? undefined : await this.validatedLines(tx, context, dto.lineItems, existing);
      if (lineItems) await tx.lineItem.deleteMany({ where: { deliveryNoteId: id, deliveryNote: { organizationId: context.organizationId } } });
      const note = await tx.deliveryNote.update({ where: { id }, data: { ...details,
        ...(lineItems ? { lineItems: { create: lineItems } } : {}) }, include: { lineItems: true } });
      await audit(tx, context, 'DeliveryNote', id, 'UPDATE', { before: JSON.parse(JSON.stringify(existing)), after: JSON.parse(JSON.stringify(note)) });
      return note;
    });
  }

  async transition(context: TenantContext, id: string, target: 'SHIPPED' | 'DELIVERED' | 'CANCELLED', key?: string) {
    if (!['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(target)) throw new BadRequestException('INVALID_TRANSITION');
    return mutation(this.prisma, context, 'nexus:delivery-notes:manage', target + ':' + id, key, {}, async tx => {
      const existing = await this.find(tx, context, id);
      if (existing.status === target) return existing;
      const allowed = target === 'SHIPPED' ? ['DRAFT'] : target === 'DELIVERED' ? ['SHIPPED'] : ['DRAFT', 'SHIPPED'];
      if (!allowed.includes(existing.status)) throw new ConflictException('INVALID_DELIVERY_TRANSITION');
      if (target !== 'CANCELLED') await this.validatedLines(tx, context, existing.lineItems.map(l => ({
        productServiceId: l.productServiceId, description: l.description, quantity: l.quantity,
        unitPrice: l.unitPrice, taxRate: l.taxRate, discountPercent: l.discountPercent,
      })), existing);
      const note = await tx.deliveryNote.update({ where: { id }, data: { status: target,
        ...(target === 'SHIPPED' ? { shippedAt: new Date() } : {}),
        ...(target === 'DELIVERED' ? { deliveredAt: new Date() } : {}) }, include: { lineItems: true } });
      if (target === 'DELIVERED') await reconcileSalesStock(tx, context, { type: 'DELIVERY_NOTE', id, invoiceId: note.invoiceId });
      await audit(tx, context, 'DeliveryNote', id, target, { from: existing.status, to: target });
      return note;
    });
  }

  // Minimal Invoice integration: no invoice CRUD or unrelated Sales workflow.
  issueInvoice(context: TenantContext, id: string, key?: string) {
    return mutation(this.prisma, context, 'nexus:invoices:manage', 'issue:' + id, key, {}, async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id, organizationId: context.organizationId }, include: { lineItems: true } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (!await tx.customer.findFirst({ where: { id: invoice.customerId, organizationId: context.organizationId } })) throw new NotFoundException('Customer not found');
      if (invoice.status === 'CANCELLED') throw new ConflictException('INVOICE_CANCELLED');
      if (invoice.status !== 'DRAFT') return invoice;
      if (!invoice.lineItems.length || invoice.lineItems.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0)) throw new ConflictException('INVALID_INVOICE_LINES');
      const result = await tx.invoice.update({ where: { id }, data: { status: 'UNPAID' }, include: { lineItems: true } });
      await reconcileSalesStock(tx, context, { type: 'INVOICE', id });
      await audit(tx, context, 'Invoice', id, 'ISSUE', { from: 'DRAFT', to: 'UNPAID' });
      return result;
    });
  }

  private key(header?: string, body?: string) {
    if (header && body && header !== body) throw new BadRequestException('IDEMPOTENCY_KEY_MISMATCH');
    return header ?? body;
  }
}
