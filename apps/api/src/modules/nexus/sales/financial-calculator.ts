import { CreateLineItemDto, LineItemDto } from '@nexora/nexus';

export class SalesFinancialService {
  public static round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  public static calculateTotals(
    lines: CreateLineItemDto[],
    parentRef: {
      quoteId?: string;
      invoiceId?: string;
      deliveryNoteId?: string;
      purchaseOrderId?: string;
    }
  ): {
    totalUntaxed: number;
    totalTax: number;
    totalAmount: number;
    processedLineItems: LineItemDto[];
  } {
    let totalUntaxed = 0;
    let totalTax = 0;

    const processedLineItems: LineItemDto[] = lines.map((line, index) => {
      const qty = Math.max(0, line.quantity || 0);
      const unitPrice = Math.max(0, line.unitPrice || 0);
      const taxRate = Math.max(0, line.taxRate || 0);
      const discountPercent = Math.min(100, Math.max(0, line.discountPercent || 0));

      const lineUntaxed = this.round2(qty * unitPrice * (1 - discountPercent / 100));
      const lineTax = this.round2(lineUntaxed * (taxRate / 100));

      totalUntaxed += lineUntaxed;
      totalTax += lineTax;

      return {
        id: `line-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
        productServiceId: line.productServiceId,
        quoteId: parentRef.quoteId,
        invoiceId: parentRef.invoiceId,
        deliveryNoteId: parentRef.deliveryNoteId,
        purchaseOrderId: parentRef.purchaseOrderId,
        description: line.description,
        quantity: qty,
        unitPrice,
        taxRate,
        discountPercent,
        totalPrice: lineUntaxed,
      };
    });

    totalUntaxed = this.round2(totalUntaxed);
    totalTax = this.round2(totalTax);
    const totalAmount = this.round2(totalUntaxed + totalTax);

    return {
      totalUntaxed,
      totalTax,
      totalAmount,
      processedLineItems,
    };
  }
}
