import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@nexora/core';
import { Prisma } from '@prisma/client';
import { quantities } from './delivery-validation';

/** Both delivery confirmation and invoice issue MUST call this inside a Serializable transaction. */
export async function reconcileSalesStock(tx: Prisma.TransactionClient, context: TenantContext,
  source: { type: 'INVOICE' | 'DELIVERY_NOTE'; id: string; invoiceId?: string | null }) {
  const organizationId = context.organizationId;
  const invoiceId = source.type === 'INVOICE' ? source.id : source.invoiceId;
  const scope = invoiceId ? 'INVOICE:' + invoiceId : 'DELIVERY_NOTE:' + source.id;
  let desired: Map<string, number>;
  let issuedInvoice = false;
  let priorDelivered = new Map<string, number>();
  let referenceIds = [source.id];
  if (invoiceId) {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { lineItems: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'CANCELLED') throw new ConflictException('INVOICE_CANCELLED');
    issuedInvoice = invoice.status !== 'DRAFT';
    const notes = await tx.deliveryNote.findMany({ where: { invoiceId, organizationId }, include: { lineItems: true } });
    if (notes.some(n => n.customerId !== invoice.customerId)) throw new ConflictException('SOURCE_CUSTOMER_MISMATCH');
    const delivered = quantities(notes.filter(n => n.status === 'DELIVERED').flatMap(n => n.lineItems));
    priorDelivered = quantities(notes.filter(n => n.status === 'DELIVERED' &&
      !(source.type === 'DELIVERY_NOTE' && n.id === source.id)).flatMap(n => n.lineItems));
    const invoiced = quantities(invoice.lineItems);
    for (const [id, quantity] of delivered) {
      if (quantity > (invoiced.get(id) ?? 0)) throw new ConflictException('INVOICE_QUANTITY_EXCEEDED');
    }
    desired = invoice.status === 'DRAFT' ? delivered : invoiced;
    referenceIds = [invoiceId, ...notes.map(n => n.id)];
  } else {
    const note = await tx.deliveryNote.findFirst({ where: { id: source.id, organizationId }, include: { lineItems: true } });
    if (!note) throw new NotFoundException('Delivery note not found');
    desired = quantities(note.status === 'DELIVERED' ? note.lineItems : []);
  }
  // Deterministic order reduces deadlocks for concurrent documents sharing multiple products.
  for (const [productId, required] of [...desired].sort(([a], [b]) => a.localeCompare(b))) {
    const product = await tx.productService.findFirst({ where: { id: productId, organizationId } });
    if (!product) throw new NotFoundException('Catalog item not found');
    if (product.type === 'SERVICE') continue;
    const identity = { organizationId, scope, productId };
    const allocation = await tx.salesStockAllocation.findUnique({ where: { organizationId_scope_productId: identity } });
    if ((allocation?.quantity ?? 0) < (priorDelivered.get(productId) ?? 0)) {
      throw new ConflictException('LEGACY_STOCK_RECONCILIATION_REQUIRED');
    }
    if (!allocation && issuedInvoice && source.type === 'DELIVERY_NOTE') {
      throw new ConflictException('LEGACY_STOCK_RECONCILIATION_REQUIRED');
    }
    if (!allocation && await tx.stockMovement.findFirst({ where: { organizationId, productId, type: 'OUT',
      referenceDocType: { in: ['INVOICE', 'DELIVERY_NOTE'] }, referenceDocId: { in: referenceIds } } })) {
      // Never guess whether pre-migration stock was already consumed.
      throw new ConflictException('LEGACY_STOCK_RECONCILIATION_REQUIRED');
    }
    const delta = new Prisma.Decimal(required).minus(allocation?.quantity ?? 0).toNumber();
    if (delta < 0) throw new ConflictException('STOCK_ALLOCATION_IMMUTABLE');
    if (!delta) continue;
    // Numeric arithmetic avoids Float round-off (e.g. 0.3 - 0.1 - 0.2), retaining the existing schema.
    const updated = await tx.$executeRaw`UPDATE products_services
      SET current_stock = (current_stock::numeric - ${delta}::numeric)::double precision
      WHERE id = ${productId} AND organization_id = ${organizationId} AND type = 'PRODUCT'
        AND current_stock::numeric >= ${delta}::numeric`;
    if (updated !== 1) throw new ConflictException('INSUFFICIENT_STOCK');
    await tx.stockMovement.create({ data: { organizationId, productId, type: 'OUT', quantity: delta,
      unitCost: product.purchaseCost, referenceDocType: source.type, referenceDocId: source.id, createdBy: context.userId } });
    await tx.salesStockAllocation.upsert({ where: { organizationId_scope_productId: identity },
      create: { ...identity, quantity: required }, update: { quantity: required } });
  }
}
