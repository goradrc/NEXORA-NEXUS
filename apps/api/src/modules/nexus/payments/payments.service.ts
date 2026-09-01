import { TenantContext, RolesGuard, AuditService } from '@nexora/core';
import { CreatePaymentDto, PaymentDto } from '@nexora/nexus';
import { InvoicesService } from '../invoices/invoices.service';
import { CustomersService } from '../customers/customers.service';

export class PaymentsService {
  private static paymentsStore: PaymentDto[] = [];

  public static getPayments(
    tenantContext: TenantContext,
    userPermissions: string[],
    invoiceId?: string
  ): PaymentDto[] {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:read');
    return this.paymentsStore.filter(
      p => p.organizationId === tenantContext.organizationId && (!invoiceId || p.invoiceId === invoiceId)
    );
  }

  public static createPayment(
    tenantContext: TenantContext,
    dto: CreatePaymentDto,
    userPermissions: string[]
  ): PaymentDto {
    RolesGuard.enforcePermission(userPermissions, 'nexus:payments:create');

    if (dto.amount <= 0) {
      throw new Error('INVALID_AMOUNT: Payment amount must be greater than zero');
    }

    const orgId = tenantContext.organizationId;
    const invoice = InvoicesService.getInvoiceById(tenantContext, dto.invoiceId, userPermissions);

    if (!invoice) {
      throw new Error('INVOICE_NOT_FOUND: Targeted invoice does not exist for this tenant');
    }

    if (dto.amount > invoice.amountDue) {
      throw new Error(`OVERPAYMENT_EXCEEDED: Payment amount (${dto.amount}) exceeds invoice remaining balance (${invoice.amountDue})`);
    }

    // Update invoice payment state
    InvoicesService.updateInvoicePaymentState(tenantContext, dto.invoiceId, dto.amount);

    // Update customer balance if customer exists
    const customer = CustomersService.findOne(tenantContext, dto.customerId, userPermissions);
    if (customer) {
      const newBalance = Math.max(0, Math.round((customer.balance - dto.amount) * 100) / 100);
      CustomersService.update(tenantContext, dto.customerId, { balance: newBalance }, userPermissions);
    }

    const count = this.paymentsStore.filter(p => p.organizationId === orgId).length + 1;
    const autoNumber = dto.paymentNumber || `PAY-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;

    const newPayment: PaymentDto = {
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      organizationId: orgId,
      customerId: dto.customerId,
      invoiceId: dto.invoiceId,
      paymentNumber: autoNumber,
      amount: Math.round(dto.amount * 100) / 100,
      paymentMethod: dto.paymentMethod,
      referenceCode: dto.referenceCode,
      paymentDate: dto.paymentDate || new Date(),
      createdAt: new Date(),
    };

    this.paymentsStore.push(newPayment);

    AuditService.log({
      organizationId: orgId,
      userId: tenantContext.userId,
      action: 'CREATE',
      entityName: 'Payment',
      entityId: newPayment.id,
      changes: {
        paymentNumber: newPayment.paymentNumber,
        amount: newPayment.amount,
        invoiceId: dto.invoiceId,
      },
    });

    return newPayment;
  }

  public static clearStoreForTesting(): void {
    this.paymentsStore = [];
  }
}
