import { TenantContext, PdfService } from '@nexora/core';
import { QuotesService } from '../modules/nexus/quotes/quotes.service';
import { InvoicesService } from '../modules/nexus/invoices/invoices.service';
import { PaymentsService } from '../modules/nexus/payments/payments.service';
import { CustomersService } from '../modules/nexus/customers/customers.service';
import { OpenApiRegistry } from '../openapi/openapi.doc';

export class SalesController {
  // Quotes
  public static getQuotes(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/quotes',
      method: 'GET',
      summary: 'List sales quotes',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:quotes:read'],
      responses: { 200: 'Quotes list' },
    });
    return QuotesService.getQuotes(tenantContext, permissions);
  }

  public static createQuote(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/quotes',
      method: 'POST',
      summary: 'Create sales quote / proforma',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:quotes:create'],
      responses: { 201: 'Quote created' },
    });
    return QuotesService.createQuote(tenantContext, dto, permissions);
  }

  // Invoices
  public static getInvoices(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/invoices',
      method: 'GET',
      summary: 'List invoices',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:invoices:read'],
      responses: { 200: 'Invoices list' },
    });
    return InvoicesService.getInvoices(tenantContext, permissions);
  }

  public static createInvoice(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/invoices',
      method: 'POST',
      summary: 'Create sales invoice with stock deduction',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:invoices:create'],
      responses: { 201: 'Invoice created' },
    });
    return InvoicesService.createInvoice(tenantContext, dto, permissions);
  }

  public static convertQuoteToInvoice(tenantContext: TenantContext, quoteId: string, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/quotes/{id}/convert',
      method: 'POST',
      summary: 'Convert accepted quote to invoice',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:invoices:create', 'nexus:quotes:update'],
      responses: { 201: 'Invoice generated from quote' },
    });
    return InvoicesService.createInvoiceFromQuote(tenantContext, quoteId, permissions);
  }

  // Payments
  public static getPayments(tenantContext: TenantContext, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/payments',
      method: 'GET',
      summary: 'List payment receipts',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:payments:read'],
      responses: { 200: 'Payments list' },
    });
    return PaymentsService.getPayments(tenantContext, permissions);
  }

  public static createPayment(tenantContext: TenantContext, dto: any, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/payments',
      method: 'POST',
      summary: 'Record payment for invoice and update customer balance',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:payments:create'],
      responses: { 201: 'Payment recorded' },
    });
    return PaymentsService.createPayment(tenantContext, dto, permissions);
  }

  // PDF Document Generation
  public static getInvoicePdfHtml(tenantContext: TenantContext, invoiceId: string, permissions: string[]) {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/sales/invoices/{id}/pdf',
      method: 'GET',
      summary: 'Generate HTML/PDF invoice document',
      tags: ['Sales'],
      security: true,
      requiredPermissions: ['nexus:invoices:read'],
      responses: { 200: 'HTML document string' },
    });

    const invoice = InvoicesService.getInvoiceById(tenantContext, invoiceId, permissions);
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');

    let customerName = 'Client';
    try {
      const cust = CustomersService.findOne(tenantContext, invoice.customerId, ['nexus:customers:read']);
      if (cust) customerName = cust.name;
    } catch (e) {}

    return PdfService.generateDocumentHtml({
      title: 'FACTURE DE VENTE',
      documentNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      dueDate: invoice.dueDate,
      organization: {
        name: 'NEXORA Corporation',
        taxId: 'NIF-STAT-001',
      },
      customer: {
        name: customerName,
      },
      lineItems: invoice.lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || 0,
        totalPrice: item.totalPrice,
      })),
      totalUntaxed: invoice.totalUntaxed,
      totalTax: invoice.totalTax,
      totalAmount: invoice.totalAmount,
    });
  }
}
