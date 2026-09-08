import { ApiClient, ApiResponse } from './api-client';
import {
  QuoteDto,
  CreateQuoteDto,
  UpdateQuoteDto,
  InvoiceDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  DeliveryNoteDto,
  CreateDeliveryNoteDto,
  UpdateDeliveryNoteDto,
  PaymentDto,
  CreatePaymentDto,
  CancelPaymentDto,
} from '@nexora/nexus';

export class SalesApiClient {
  // Quotes
  public static async getQuotes(): Promise<ApiResponse<QuoteDto[]>> {
    return ApiClient.request<QuoteDto[]>('/nexus/quotes');
  }

  public static async getQuote(id: string): Promise<ApiResponse<QuoteDto>> {
    return ApiClient.request<QuoteDto>(`/nexus/quotes/${id}`);
  }

  public static async createQuote(dto: CreateQuoteDto): Promise<ApiResponse<QuoteDto>> {
    return ApiClient.request<QuoteDto>('/nexus/quotes', {
      method: 'POST',
      body: dto,
    });
  }

  public static async updateQuote(id: string, dto: UpdateQuoteDto): Promise<ApiResponse<QuoteDto>> {
    return ApiClient.request<QuoteDto>(`/nexus/quotes/${id}`, {
      method: 'PUT',
      body: dto,
    });
  }

  public static async convertQuoteToInvoice(id: string): Promise<ApiResponse<InvoiceDto>> {
    return ApiClient.request<InvoiceDto>(`/nexus/quotes/${id}/convert-to-invoice`, {
      method: 'POST',
    });
  }

  // Invoices
  public static async getInvoices(): Promise<ApiResponse<InvoiceDto[]>> {
    return ApiClient.request<InvoiceDto[]>('/nexus/invoices');
  }

  public static async getInvoice(id: string): Promise<ApiResponse<InvoiceDto>> {
    return ApiClient.request<InvoiceDto>(`/nexus/invoices/${id}`);
  }

  public static async createInvoice(dto: CreateInvoiceDto): Promise<ApiResponse<InvoiceDto>> {
    return ApiClient.request<InvoiceDto>('/nexus/invoices', {
      method: 'POST',
      body: dto,
    });
  }

  public static async updateInvoice(id: string, dto: UpdateInvoiceDto): Promise<ApiResponse<InvoiceDto>> {
    return ApiClient.request<InvoiceDto>(`/nexus/invoices/${id}`, {
      method: 'PUT',
      body: dto,
    });
  }

  public static async issueInvoice(id: string): Promise<ApiResponse<InvoiceDto>> {
    return ApiClient.request<InvoiceDto>(`/nexus/invoices/${id}/issue`, {
      method: 'POST',
    });
  }

  // Delivery Notes
  public static async getDeliveryNotes(): Promise<ApiResponse<DeliveryNoteDto[]>> {
    return ApiClient.request<DeliveryNoteDto[]>('/nexus/delivery-notes');
  }

  public static async getDeliveryNote(id: string): Promise<ApiResponse<DeliveryNoteDto>> {
    return ApiClient.request<DeliveryNoteDto>(`/nexus/delivery-notes/${id}`);
  }

  public static async createDeliveryNote(dto: CreateDeliveryNoteDto): Promise<ApiResponse<DeliveryNoteDto>> {
    return ApiClient.request<DeliveryNoteDto>('/nexus/delivery-notes', {
      method: 'POST',
      body: dto,
    });
  }

  public static async updateDeliveryNote(
    id: string,
    dto: UpdateDeliveryNoteDto
  ): Promise<ApiResponse<DeliveryNoteDto>> {
    return ApiClient.request<DeliveryNoteDto>(`/nexus/delivery-notes/${id}`, {
      method: 'PUT',
      body: dto,
    });
  }

  public static async deliverDeliveryNote(id: string): Promise<ApiResponse<DeliveryNoteDto>> {
    return ApiClient.request<DeliveryNoteDto>(`/nexus/delivery-notes/${id}/deliver`, {
      method: 'POST',
    });
  }

  // Payments
  public static async getPayments(invoiceId?: string): Promise<ApiResponse<PaymentDto[]>> {
    const query = invoiceId ? `?invoiceId=${invoiceId}` : '';
    return ApiClient.request<PaymentDto[]>(`/nexus/payments${query}`);
  }

  public static async createPayment(dto: CreatePaymentDto): Promise<ApiResponse<PaymentDto>> {
    return ApiClient.request<PaymentDto>('/nexus/payments', {
      method: 'POST',
      body: dto,
    });
  }

  public static async cancelPayment(id: string, dto: CancelPaymentDto): Promise<ApiResponse<PaymentDto>> {
    return ApiClient.request<PaymentDto>(`/nexus/payments/${id}/cancel`, {
      method: 'POST',
      body: dto,
    });
  }
}
