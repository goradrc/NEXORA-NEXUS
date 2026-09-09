import { BadRequestException } from '@nestjs/common';
import type { CreateLineItemDto } from '@nexora/nexus';
import { Prisma } from '@prisma/client';

export function object(value: any, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) {
    throw new BadRequestException('INVALID_FIELDS');
  }
}
export function textField(value: any, required = false, max = 2000): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new BadRequestException('INVALID_TEXT');
  return value;
}
export function lines(value: any): Required<CreateLineItemDto>[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new BadRequestException('INVALID_LINES');
  return value.map(line => {
    object(line, ['productServiceId', 'description', 'quantity', 'unitPrice', 'taxRate', 'discountPercent']);
    textField(line.productServiceId, true, 100);
    textField(line.description, true);
    const normalized = { ...line, taxRate: line.taxRate ?? 0, discountPercent: line.discountPercent ?? 0 };
    for (const field of ['quantity', 'unitPrice', 'taxRate', 'discountPercent']) {
      const n = normalized[field];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e9) throw new BadRequestException('INVALID_LINE_NUMBER');
    }
    if (normalized.quantity <= 0 || normalized.taxRate > 100 || normalized.discountPercent > 100) throw new BadRequestException('INVALID_LINE_NUMBER');
    return normalized;
  });
}
export function metadata(dto: any) {
  return Object.fromEntries(['shippingAddress', 'carrierName', 'trackingNumber', 'notes']
    .filter(k => dto[k] !== undefined).map(k => [k, textField(dto[k])]));
}
export function quantities(items: { productServiceId: string; quantity: number }[]) {
  const result = new Map<string, number>();
  for (const item of items) result.set(item.productServiceId,
    new Prisma.Decimal(result.get(item.productServiceId) ?? 0).plus(item.quantity).toNumber());
  return result;
}
