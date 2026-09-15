import { BadRequestException, ConflictException, Injectable, NotFoundException } from '../../../common/exceptions';
import { TenantContext } from '@nexora/core';
import type { CreateInvoiceDto, UpdateInvoiceDto } from '@nexora/nexus';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/database.service';
import { audit, authorize, mutation } from '../delivery-notes/sales-transaction';
import { lines, object, textField } from '../delivery-notes/delivery-validation';
import { reconcileSalesStock } from '../delivery-notes/sales-stock';
import { calculateFinancialTotals } from '../sales/financial-calculator';

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
      include: { lineItems: true, deliveryNotes: true },
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

    const customer = await tx.customer.findFirst({ where: { ...where, id: source.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    for (const productServiceId of new Set(normalized.map((l) => l.productServiceId))) {
      const item = await tx.productService.findFirst({ where: { ...where, id: productServiceId } });
      if (!item) throw new NotFoundException('Catalog item not found');
    }

    if (source.quoteId) {
      const quote = await tx.quote.findFirst({ where: { ...where, id: source.quoteId } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.customerId !== source.customerId || !['ACCEPTED', 'CONVERTED'].includes(quote.status)) {
        throw new ConflictException('INVALID_QUOTE_SOURCE');
      }
    }

    const financials = calculateFinancialTotals(normalized as any[]);

    for (const line of financials.lineItems) {
      if (!Number.isFinite(line.totalPrice) || line.totalPrice > Number.MAX_SAFE_INTEGER) {
        throw new BadRequestException('LINE_TOTAL_OVERFLOW');
      }
    }

    const processedLines: Prisma.LineItemUncheckedCreateWithoutInvoiceInput[] = financials.lineItems.map((l) => ({
      productServiceId: l.productServiceId!,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      discountPercent: l.discountPercent,
      totalPrice: l.totalPrice,
    }));

    return {
      lineItems: processedLines,
      totalUntaxed: financials.totalUntaxed,
      totalTax: financials.totalTax,
      totalAmount: financials.totalAmount,
    };
  }

  private async validateDeliveryNotes(
    tx: Prisma.TransactionClient,
    context: TenantContext,
    deliveryNoteIds: string[],
    customerId: string,
    currentInvoiceId?: string
  ) {
    if (!deliveryNoteIds.length) return [];

    const notes = await tx.deliveryNote.findMany({
      where: { id: { in: deliveryNoteIds }, organizationId: context.organizationId },
    });

    if (notes.length !== deliveryNoteIds.length) {
      throw new NotFoundException('Delivery note not found');
    }

    for (const note of notes) {
      if (note.customerId !== customerId) {
        throw new ConflictException('CUSTOMER_MISMATCH_DELIVERY_NOTE');
      }
      if (note.status === 'CANCELLED') {
        throw new ConflictException('DELIVERY_NOTE_CANCELLED');
      }
      if (note.invoiceId && note.invoiceId !== currentInvoiceId) {
        throw new ConflictException('ALREADY_INVOICED');
      }
    }

    return notes;
  }

  async create(context: TenantContext, dto: CreateInvoiceDto, key?: string) {
    object(dto, ['customerId', 'quoteId', 'dueDate', 'lineItems', 'deliveryNoteIds', 'idempotencyKey']);
    textField(dto.customerId, true, 100);
    textField(dto.quoteId, dto.quoteId !== undefined, 100);

    if (!dto.dueDate || isNaN(Date.parse(dto.dueDate))) {
      throw new BadRequestException('INVALID_DUE_DATE');
    }

    key = this.key(key, dto.idempotencyKey);
    if (!key) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');

    const deliveryNoteIds = Array.isArray(dto.deliveryNoteIds) ? dto.deliveryNoteIds : [];

    const { idempotencyKey: _key, ...payload } = dto;
    return mutation(this.prisma, context, 'nexus:invoices:create', 'create', key, payload, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, organizationId: context.organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      if (deliveryNoteIds.length > 0) {
        await this.validateDeliveryNotes(tx, context, deliveryNoteIds, dto.customerId);
      }

      const { lineItems, totalUntaxed, totalTax, totalAmount } = await this.validatedLines(
        tx,
        context,
        dto.lineItems,
        dto
      );

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
        include: { lineItems: true, deliveryNotes: true },
      });

      if (deliveryNoteIds.length > 0) {
        await tx.deliveryNote.updateMany({
          where: { id: { in: deliveryNoteIds }, organizationId: context.organizationId },
          data: { invoiceId: invoice.id },
        });
      }

      await audit(tx, context, 'Invoice', invoice.id, 'CREATE', { after: JSON.parse(JSON.stringify(invoice)) });
      return this.find(tx, context, invoice.id);
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateInvoiceDto, key?: string) {
    object(dto, ['customerId', 'dueDate', 'lineItems', 'deliveryNoteIds']);

    if (dto.dueDate !== undefined && (!dto.dueDate || isNaN(Date.parse(dto.dueDate)))) {
      throw new BadRequestException('INVALID_DUE_DATE');
    }

    return mutation(this.prisma, context, 'nexus:invoices:update', 'update:' + id, key, dto, async (tx) => {
      const existing = await this.find(tx, context, id);
      if (existing.status !== 'DRAFT') throw new ConflictException('INVOICE_LOCKED');

      const customerId = dto.customerId || existing.customerId;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, organizationId: context.organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      const deliveryNoteIds = dto.deliveryNoteIds !== undefined
        ? (Array.isArray(dto.deliveryNoteIds) ? dto.deliveryNoteIds : [])
        : undefined;

      if (deliveryNoteIds !== undefined && deliveryNoteIds.length > 0) {
        await this.validateDeliveryNotes(tx, context, deliveryNoteIds, customerId, id);
      }

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
        include: { lineItems: true, deliveryNotes: true },
      });

      if (deliveryNoteIds !== undefined) {
        await tx.deliveryNote.updateMany({
          where: { invoiceId: id, organizationId: context.organizationId },
          data: { invoiceId: null },
        });
        if (deliveryNoteIds.length > 0) {
          await tx.deliveryNote.updateMany({
            where: { id: { in: deliveryNoteIds }, organizationId: context.organizationId },
            data: { invoiceId: id },
          });
        }
      }

      await audit(tx, context, 'Invoice', id, 'UPDATE', {
        before: JSON.parse(JSON.stringify(existing)),
        after: JSON.parse(JSON.stringify(invoice)),
      });
      return this.find(tx, context, id);
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

      // Intelligent sequence recovery from existing DB invoices for FAC-YYYY-XXXX
      const existingInvoices = await tx.invoice.findMany({
        where: {
          organizationId: context.organizationId,
          invoiceNumber: { startsWith: `FAC-${year}-` },
        },
        select: { invoiceNumber: true },
      });

      let maxSeq = 0;
      for (const inv of existingInvoices) {
        const parts = inv.invoiceNumber.split('-');
        if (parts.length === 3) {
          const num = parseInt(parts[2], 10);
          if (Number.isInteger(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }

      let nextValue = 1;
      try {
        await tx.$executeRaw`
          INSERT INTO "invoice_sequences" ("organization_id", "year", "value")
          VALUES (${context.organizationId}, ${year}, 0)
          ON CONFLICT ("organization_id", "year") DO NOTHING
        `;

        const lockedSeq: any[] = await tx.$queryRaw`
          SELECT "value" FROM "invoice_sequences"
          WHERE "organization_id" = ${context.organizationId} AND "year" = ${year}
          FOR UPDATE
        `;

        const currentSeqVal = Array.isArray(lockedSeq) && lockedSeq.length > 0 ? Number(lockedSeq[0].value) : 0;
        nextValue = Math.max(currentSeqVal, maxSeq) + 1;

        await tx.$executeRaw`
          UPDATE "invoice_sequences"
          SET "value" = ${nextValue}
          WHERE "organization_id" = ${context.organizationId} AND "year" = ${year}
        `;
      } catch {
        const seqRecord = await tx.invoiceSequence.findUnique({
          where: { organizationId_year: { organizationId: context.organizationId, year } },
        });
        const currentSeqVal = seqRecord?.value ?? 0;
        nextValue = Math.max(currentSeqVal, maxSeq) + 1;

        await tx.invoiceSequence.upsert({
          where: { organizationId_year: { organizationId: context.organizationId, year } },
          create: { organizationId: context.organizationId, year, value: nextValue },
          update: { value: nextValue },
        });
      }

      const invoiceNumber = `FAC-${year}-${String(nextValue).padStart(4, '0')}`;

      const result = await tx.invoice.update({
        where: { id },
        data: {
          status: 'UNPAID',
          invoiceNumber,
        },
        include: { lineItems: true, deliveryNotes: true },
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
        await reconcileSalesStock(tx, context, { type: 'INVOICE', id, cancel: true } as any);
      }

      const invoice = await tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { lineItems: true, deliveryNotes: true },
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
