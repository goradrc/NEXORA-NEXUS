import { CreateLineItemDto, LineItemDto } from '@nexora/nexus';

export interface CalculatedTotals {
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  processedLineItems: LineItemDto[];
}

export class SalesFinancialService {
  public static round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  public static calculateTotals(
    rawLines: CreateLineItemDto[],
    parentDocId?: { quoteId?: string; invoiceId?: string; deliveryNoteId?: string; purchaseOrderId?: string }
  ): CalculatedTotals {
    let totalUntaxed = 0;
    let totalTax = 0;

    const processedLineItems: LineItemDto[] = rawLines.map((line, idx) => {
      const quantity = line.quantity;
      const unitPrice = line.unitPrice;
      const taxRate = line.taxRate || 0;
      const discountPercent = line.discountPercent || 0;

      const gross = quantity * unitPrice;
      const discountAmount = gross * (discountPercent / 100);
      const lineUntaxed = this.round2(gross - discountAmount);
      const lineTax = this.round2(lineUntaxed * (taxRate / 100));
      const totalPrice = this.round2(lineUntaxed + lineTax);

      totalUntaxed += lineUntaxed;
      totalTax += lineTax;

      return {
        id: `line-${Date.now()}-${idx}`,
        productServiceId: line.productServiceId,
        quoteId: parentDocId?.quoteId,
        invoiceId: parentDocId?.invoiceId,
        deliveryNoteId: parentDocId?.deliveryNoteId,
        purchaseOrderId: parentDocId?.purchaseOrderId,
        description: line.description,
        quantity,
        unitPrice,
        taxRate,
        discountPercent,
        totalPrice,
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
