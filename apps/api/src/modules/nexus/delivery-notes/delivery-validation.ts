import { BadRequestException } from '../../../common/exceptions';
import type { CreateLineItemDto } from '@nexora/nexus';
import { Prisma } from '@prisma/client';

export function object(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('INVALID_PAYLOAD');
  const actual = Object.keys(value);
  if (actual.some(k => !allowed.includes(k))) throw new BadRequestException('UNRECOGNIZED_FIELD');
}

export function textField(value: unknown, required: boolean, max = 200): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequestException('MISSING_FIELD');
    return undefined;
  }
  if (typeof value !== 'string') throw new BadRequestException('INVALID_TYPE');
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new BadRequestException('MISSING_FIELD');
    return undefined;
  }
  if (trimmed.length > max) throw new BadRequestException('FIELD_TOO_LONG');
  return trimmed;
}

export function lines(input: unknown): CreateLineItemDto[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) throw new BadRequestException('INVALID_LINE_ITEMS');
  return input.map(item => {
    object(item, ['productServiceId', 'description', 'quantity', 'unitPrice', 'taxRate', 'discountPercent']);
    const productServiceId = textField(item.productServiceId, true, 100)!;
    const description = textField(item.description, true, 500)!;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) throw new BadRequestException('INVALID_QUANTITY');
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000000) throw new BadRequestException('INVALID_UNIT_PRICE');
    const taxRate = item.taxRate === undefined ? 0 : Number(item.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new BadRequestException('INVALID_TAX_RATE');
    const discountPercent = item.discountPercent === undefined ? 0 : Number(item.discountPercent);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw new BadRequestException('INVALID_DISCOUNT_PERCENT');
    return { productServiceId, description, quantity, unitPrice, taxRate, discountPercent };
  });
}

export function metadata(dto: { shippingAddress?: string; carrierName?: string; trackingNumber?: string; notes?: string }) {
  return {
    shippingAddress: textField(dto.shippingAddress, false, 500),
    carrierName: textField(dto.carrierName, false, 100),
    trackingNumber: textField(dto.trackingNumber, false, 100),
    notes: textField(dto.notes, false, 1000),
  };
}

export function quantities(items: Array<{ productServiceId?: string | null; quantity: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.productServiceId) continue;
    map.set(item.productServiceId, (map.get(item.productServiceId) ?? 0) + item.quantity);
  }
  return map;
}
