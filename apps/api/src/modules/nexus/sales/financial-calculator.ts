import { Prisma } from '@prisma/client';

export interface RawLineItem {
  productServiceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercent?: number;
}

export interface CalculatedFinancials<T> {
  lineItems: T[];
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
}

export function calculateFinancialTotals<T extends RawLineItem>(
  inputLines: T[]
): CalculatedFinancials<T & { totalPrice: number }> {
  let totalUntaxedDecimal = new Prisma.Decimal(0);
  let totalTaxDecimal = new Prisma.Decimal(0);

  const processedLines = inputLines.map((line) => {
    const qty = new Prisma.Decimal(line.quantity || 0);
    const price = new Prisma.Decimal(line.unitPrice || 0);
    const taxRate = new Prisma.Decimal(line.taxRate || 0);
    const discount = new Prisma.Decimal(line.discountPercent || 0);

    const discountFactor = new Prisma.Decimal(1).minus(discount.div(100));
    const lineUntaxed = qty.times(price).times(discountFactor).toDecimalPlaces(2);
    const lineTax = lineUntaxed.times(taxRate.div(100)).toDecimalPlaces(2);
    const totalPrice = lineUntaxed.toNumber();

    totalUntaxedDecimal = totalUntaxedDecimal.plus(lineUntaxed);
    totalTaxDecimal = totalTaxDecimal.plus(lineTax);

    return {
      ...line,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      taxRate: Number(line.taxRate || 0),
      discountPercent: Number(line.discountPercent || 0),
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
