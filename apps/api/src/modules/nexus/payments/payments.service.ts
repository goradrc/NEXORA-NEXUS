import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { PaymentDto, CreatePaymentDto, CancelPaymentDto } from '@nexora/nexus';
import { InvoicesService } from '../invoices/invoices.service';
import { CustomersService } from '../customers/customers.service';
import { SalesFinancialService } from '../sales/financial-calculator';

export class PaymentsService {
  private static paymentsStore: PaymentDto[] = [];
  private static sequenceStore: Record<string, number> = {};

  private static getNextNumber(organizationId: string): string {
    const year = new Date().getFullYear();
    const key = `${organizationId}-${year}`;
    this.sequenceStore[key] = (this.sequenceStore[key] || 0) + 1;
    const seq = String(this.sequenceStore[key]).padStart(4, '0');
    return `PAY-${year}-${seq}`;
  }

  public static findAll(tenantContext: TenantContext, userPermissions: string[]): PaymentDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:read');
    return this.paymentsStore.filter((p) => p.organizationId === tenantContext.organizationId);
  }

  public static findOne(tenantContext: TenantContext, paymentId: string, userPermissions: string[]): PaymentDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:read');
    const payment = this.paymentsStore.find(
      (p) => p.id === paymentId && p.organizationId === tenantContext.organizationId
    );
    if (!payment) {
      throw new Error(`PAYMENT_NOT_FOUND: Payment ${paymentId} not found or cross-tenant access denied`);
    }
    return payment;
  }

  public static createPayment(
    tenantContext: TenantContext,
    dto: CreatePaymentDto,
    userPermissions: string[]
  ): PaymentDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:create');

    if (dto.idempotencyKey) {
      const existing = this.paymentsStore.find(
        (p) => p.organizationId === tenantContext.organizationId && p.idempotencyKey === dto.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    if (dto.amount <= 0) {
      throw new Error(`INVALID_PAYMENT_AMOUNT: Payment amount must be strictly positive`);
    }

    const invoice = InvoicesService.findOne(tenantContext, dto.invoiceId, userPermissions);

    if (invoice.status === 'DRAFT') {
      throw new Error(`INVALID_INVOICE_STATE: Cannot record payment for a DRAFT invoice`);
    }

    if (invoice.status === 'CANCELLED') {
      throw new Error(`INVALID_INVOICE_STATE: Cannot record payment for a CANCELLED invoice`);
    }

    const roundedAmount = SalesFinancialService.round2(dto.amount);

    if (roundedAmount > invoice.amountDue) {
      throw new Error(
        `OVERPAYMENT_NOT_ALLOWED: Payment amount (${roundedAmount}) exceeds invoice amount due (${invoice.amountDue})`
      );
    }

    const newAmountPaid = SalesFinancialService.round2(invoice.amountPaid + roundedAmount);
    const newStatus = newAmountPaid >= invoice.totalAmount ? 'PAID' : 'PARTIAL';

    InvoicesService.updateSettlementAmount(
      tenantContext,
      invoice.id,
      newAmountPaid,
      newStatus,
      userPermissions
    );

    // Reduce customer debt balance
    const customer = CustomersService.findOne(tenantContext, invoice.customerId, userPermissions);
    CustomersService.update(
      tenantContext,
      customer.id,
      { balance: Math.max(0, SalesFinancialService.round2(customer.balance - roundedAmount)) },
      userPermissions
    );

    const payment: PaymentDto = {
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: tenantContext.organizationId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      paymentNumber: this.getNextNumber(tenantContext.organizationId),
      amount: roundedAmount,
      paymentMethod: dto.paymentMethod,
      referenceCode: dto.referenceCode,
      paymentDate: dto.paymentDate || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      idempotencyKey: dto.idempotencyKey,
    };

    this.paymentsStore.push(payment);

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'RECORD_PAYMENT',
      entityName: 'Payment',
      entityId: payment.id,
      changes: { amount: roundedAmount, invoiceId: invoice.id },
    });

    return payment;
  }

  public static cancelPayment(
    tenantContext: TenantContext,
    paymentId: string,
    cancelDto: CancelPaymentDto,
    userPermissions: string[]
  ): boolean {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:cancel');
    const payment = this.findOne(tenantContext, paymentId, userPermissions);

    const invoice = InvoicesService.findOne(tenantContext, payment.invoiceId, userPermissions);
    const newAmountPaid = Math.max(0, SalesFinancialService.round2(invoice.amountPaid - payment.amount));
    const newStatus = newAmountPaid === 0 ? 'UNPAID' : 'PARTIAL';

    InvoicesService.updateSettlementAmount(
      tenantContext,
      invoice.id,
      newAmountPaid,
      newStatus,
      userPermissions
    );

    // Re-increase customer debt balance
    const customer = CustomersService.findOne(tenantContext, payment.customerId, userPermissions);
    CustomersService.update(
      tenantContext,
      customer.id,
      { balance: SalesFinancialService.round2(customer.balance + payment.amount) },
      userPermissions
    );

    this.paymentsStore = this.paymentsStore.filter(
      (p) => !(p.id === paymentId && p.organizationId === tenantContext.organizationId)
    );

    AuditService.log({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      action: 'CANCEL_PAYMENT',
      entityName: 'Payment',
      entityId: paymentId,
      changes: { reason: cancelDto.reason, amount: payment.amount },
    });

    return true;
  }

  public static clearStoreForTesting(): void {
    this.paymentsStore = [];
    this.sequenceStore = {};
  }
}
