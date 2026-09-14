import { BadRequestException, ConflictException, Injectable, NotFoundException } from '../../../common/exceptions';
import { TenantContext } from '@nexora/core';
import type { CreateInvoiceDto, UpdateInvoiceDto } from '@nexora/nexus';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/database.service';
import { audit, authorize, mutation } from '../delivery-notes/sales-transaction';
import { lines, metadata, object, quantities, textField } from '../delivery-notes/delivery-validation';
import { reconcileSalesStock } from '../delivery-notes/sales-stock';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(context: TenantContext, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('INVALID_OFFSET');
    return this.prisma.$transaction(
      async (tx) => {
        await authorize(tx, context, 'nexus:invoices:read');
        return tx.invoice.findMany({
          where: { organizationId: context.organizationId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: offset,
          take: 100,
          include: { lineItems: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }

  async get(context: TenantContext, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await authorize(tx, context, 'nexus:invoices:read');
        return this.find(tx, context, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }

  public async find(tx: Prisma.TransactionClient, context: TenantContext, id: string) {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId: context.organizationId },
      include: { lineItems: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async validatedLines(
    tx: Prisma.TransactionClient,
    context: TenantContext,
    input: any,
    source: { customerId: string; quoteId?: string | null }
  ) {
    const normalized = lines(input);
    const where = { organizationId: context.organizationId };

    if (!(await tx.customer.findFirst({ where: { ...where, id: source.customerId } }))) {
      throw new NotFoundException('Customer not found');
    }

    for (const productServiceId of new Set(normalized.map((l) => l.productServiceId))) {
      if (!(await tx.productService.findFirst({ where: { ...where, id: productServiceId } }))) {
        throw new NotFoundException('Catalog item not found');
      }
    }

    if (source.quoteId) {
      const quote = await tx.quote.findFirst({ where: { ...where, id: source.quoteId } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.customerId !== source.customerId || !['ACCEPTED', 'CONVERTED'].includes(quote.status)) {
        throw new ConflictException('INVALID_QUOTE_SOURCE');
      }
    }

    let totalUntaxedDecimal = new Prisma.Decimal(0);
    let totalTaxDecimal = new Prisma.Decimal(0);

    const processedLines: Prisma.LineItemUncheckedCreateWithoutInvoiceInput[] = normalized.map((l) => {
      const qty = new Prisma.Decimal(l.quantity);
      const price = new Prisma.Decimal(l.unitPrice);
      const taxRate = new Prisma.Decimal(l.taxRate || 0);
      const discount = new Prisma.Decimal(l.discountPercent || 0);

      const lineUntaxed = qty
        .times(price)
        .times(new Prisma.Decimal(1).minus(discount.div(100)))
        .toDecimalPlaces(2);

      const lineTax = lineUntaxed.times(taxRate.div(100)).toDecimalPlaces(2);
      const totalPrice = lineUntaxed.toNumber();

      if (!Number.isFinite(totalPrice) || totalPrice > Number.MAX_SAFE_INTEGER) {
        throw new BadRequestException('LINE_TOTAL_OVERFLOW');
      }

      totalUntaxedDecimal = totalUntaxedDecimal.plus(lineUntaxed);
      totalTaxDecimal = totalTaxDecimal.plus(lineTax);

      return {
        productServiceId: l.productServiceId!,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate || 0,
        discountPercent: l.discountPercent || 0,
        totalPrice,
      };
    });

    const totalUntaxed = totalUntaxedDecimal.toDecimalPlaces(2).toNumber();
    const totalTax = totalTaxDecimal.toDecimalPlaces(2).toNumber();
    const totalAmount = totalUntaxedDecimal.plus(totalTaxDecimal).toDecimalPlaces(2).toNumber();

    return {
      lineItems: processedLines,
      totalUntaxed,
      totalTax,
      totalAmount,
    };
  }

  async create(context: TenantContext, dto: CreateInvoiceDto, key?: string) {
    object(dto, ['customerId', 'quoteId', 'dueDate', 'lineItems', 'deliveryNoteIds', 'idempotencyKey']);
    textField(dto.customerId, true, 100);
    textField(dto.quoteId, dto.quoteId !== undefined, 100);
    key = this.key(key, dto.idempotencyKey);
    if (!key) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');

    const { idempotencyKey: _key, ...payload } = dto;
    return mutation(this.prisma, context, 'nexus:invoices:create', 'create', key, payload, async (tx) => {
      const { lineItems, totalUntaxed, totalTax, totalAmount } = await this.validatedLines(tx, context, dto.lineItems, dto);

      if (dto.quoteId) {
        await tx.quote.update({
          where: { id: dto.quoteId },
          data: { status: 'CONVERTED' },
        });
      }

      const invoice = await tx.invoice.create({
        data: {
          organizationId: context.organizationId,
          customerId: dto.customerId,
          quoteId: dto.quoteId,
          invoiceNumber: `TEMP-${Date.now()}`,
          status: 'DRAFT',
          totalUntaxed,
          totalTax,
          totalAmount,
          amountPaid: 0,
          amountDue: totalAmount,
          dueDate: new Date(dto.dueDate),
          lineItems: { create: lineItems },
        },
        include: { lineItems: true },
      });

      await audit(tx, context, 'Invoice', invoice.id, 'CREATE', { after: JSON.parse(JSON.stringify(invoice)) });
      return invoice;
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateInvoiceDto, key?: string) {
    object(dto, ['customerId', 'dueDate', 'lineItems']);
    return mutation(this.prisma, context, 'nexus:invoices:update', 'update:' + id, key, dto, async (tx) => {
      const existing = await this.find(tx, context, id);
      if (existing.status !== 'DRAFT') throw new ConflictException('INVOICE_LOCKED');

      const customerId = dto.customerId || existing.customerId;
      const computed = dto.lineItems === undefined
        ? undefined
        : await this.validatedLines(tx, context, dto.lineItems, { customerId, quoteId: existing.quoteId });

      if (computed) {
        await tx.lineItem.deleteMany({
          where: { invoiceId: id, invoice: { organizationId: context.organizationId } },
        });
      }

      const updateData: Prisma.InvoiceUncheckedUpdateInput = {
        ...(dto.customerId ? { customerId: dto.customerId } : {}),
        ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(computed
          ? {
              totalUntaxed: computed.totalUntaxed,
              totalTax: computed.totalTax,
              totalAmount: computed.totalAmount,
              amountDue: computed.totalAmount - existing.amountPaid,
              lineItems: { create: computed.lineItems },
            }
          : {}),
      };

      const invoice = await tx.invoice.update({
        where: { id },
        data: updateData,
        include: { lineItems: true },
      });

      await audit(tx, context, 'Invoice', id, 'UPDATE', {
        before: JSON.parse(JSON.stringify(existing)),
        after: JSON.parse(JSON.stringify(invoice)),
      });
      return invoice;
    });
  }

  async issueInvoice(context: TenantContext, id: string, key?: string) {
    return mutation(this.prisma, context, 'nexus:invoices:manage', 'issue:' + id, key, {}, async (tx) => {
      const invoice = await this.find(tx, context, id);
      if (!await tx.customer.findFirst({ where: { id: invoice.customerId, organizationId: context.organizationId } })) {
        throw new NotFoundException('Customer not found');
      }

      if (invoice.status === 'CANCELLED') throw new ConflictException('INVOICE_CANCELLED');
      if (invoice.status !== 'DRAFT') return invoice;

      if (!invoice.lineItems.length || invoice.lineItems.some((l) => !Number.isFinite(l.quantity) || l.quantity <= 0)) {
        throw new ConflictException('INVALID_INVOICE_LINES');
      }

      const year = new Date().getUTCFullYear();
      const sequence = await tx.invoiceSequence.upsert({
        where: { organizationId_year: { organizationId: context.organizationId, year } },
        create: { organizationId: context.organizationId, year, value: 1 },
        update: { value: { increment: 1 } },
      });

      const invoiceNumber = `FAC-${year}-${String(sequence.value).padStart(4, '0')}`;

      const result = await tx.invoice.update({
        where: { id },
        data: {
          status: 'UNPAID',
          invoiceNumber,
        },
        include: { lineItems: true },
      });

      await reconcileSalesStock(tx, context, { type: 'INVOICE', id });

      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { balance: { increment: invoice.totalAmount } },
      });

      await audit(tx, context, 'Invoice', id, 'ISSUE', { from: 'DRAFT', to: 'UNPAID', invoiceNumber });
      return result;
    });
  }

  async cancelInvoice(context: TenantContext, id: string, reason?: string, key?: string) {
    return mutation(this.prisma, context, 'nexus:invoices:manage', 'cancel:' + id, key, { reason }, async (tx) => {
      const existing = await this.find(tx, context, id);
      if (existing.status === 'CANCELLED') return existing;
      if (existing.status === 'PAID') throw new ConflictException('CANNOT_CANCEL_PAID_INVOICE');

      if (existing.status !== 'DRAFT') {
        const remainingUnpaid = existing.totalAmount - existing.amountPaid;
        if (remainingUnpaid > 0) {
          await tx.customer.update({
            where: { id: existing.customerId },
            data: { balance: { decrement: remainingUnpaid } },
          });
        }
      }

      const invoice = await tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { lineItems: true },
      });

      await audit(tx, context, 'Invoice', id, 'CANCEL', { reason, from: existing.status, to: 'CANCELLED' });
      return invoice;
    });
  }

  private key(header?: string, body?: string) {
    if (header && body && header !== body) throw new BadRequestException('IDEMPOTENCY_KEY_MISMATCH');
    return header ?? body;
  }
}
