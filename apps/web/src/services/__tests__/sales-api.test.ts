import { SalesApiClient } from '../sales-api';
import { ApiClient } from '../api-client';
import {
  CreateQuoteDto,
  CreateInvoiceDto,
  CreateDeliveryNoteDto,
  CreatePaymentDto,
} from '@nexora/nexus';

jest.mock('../api-client');

describe('SalesApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Quotes API', () => {
    it('should call getQuotes endpoint', async () => {
      const mockResponse = { status: 200, data: [{ id: 'q-1', quoteNumber: 'DEV-2026-0001' }] };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.getQuotes();

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/quotes');
      expect(res).toEqual(mockResponse);
    });

    it('should call getQuote endpoint with id', async () => {
      const mockResponse = { status: 200, data: { id: 'q-1', quoteNumber: 'DEV-2026-0001' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.getQuote('q-1');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/quotes/q-1');
      expect(res).toEqual(mockResponse);
    });

    it('should call createQuote with payload', async () => {
      const dto: CreateQuoteDto = {
        customerId: 'cust-1',
        validUntil: '2026-12-31',
        lineItems: [
          { description: 'Item 1', quantity: 2, unitPrice: 100, taxRate: 20, discountPercent: 0 },
        ],
      };
      const mockResponse = { status: 201, data: { id: 'q-1', ...dto } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.createQuote(dto);

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/quotes', {
        method: 'POST',
        body: dto,
      });
      expect(res).toEqual(mockResponse);
    });

    it('should call convertQuoteToInvoice endpoint', async () => {
      const mockResponse = { status: 200, data: { id: 'inv-1', invoiceNumber: 'FAC-2026-0001' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.convertQuoteToInvoice('q-1');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/quotes/q-1/convert-to-invoice', {
        method: 'POST',
      });
      expect(res).toEqual(mockResponse);
    });
  });

  describe('Invoices API', () => {
    it('should call getInvoices endpoint', async () => {
      const mockResponse = { status: 200, data: [{ id: 'inv-1', invoiceNumber: 'FAC-2026-0001' }] };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.getInvoices();

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/invoices');
      expect(res).toEqual(mockResponse);
    });

    it('should call createInvoice with payload', async () => {
      const dto: CreateInvoiceDto = {
        customerId: 'cust-1',
        dueDate: '2026-12-31',
        lineItems: [
          { description: 'Item A', quantity: 1, unitPrice: 500, taxRate: 20, discountPercent: 0 },
        ],
      };
      const mockResponse = { status: 201, data: { id: 'inv-1', ...dto } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.createInvoice(dto);

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/invoices', {
        method: 'POST',
        body: dto,
      });
      expect(res).toEqual(mockResponse);
    });

    it('should call issueInvoice endpoint', async () => {
      const mockResponse = { status: 200, data: { id: 'inv-1', status: 'UNPAID' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.issueInvoice('inv-1');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/invoices/inv-1/issue', {
        method: 'POST',
      });
      expect(res).toEqual(mockResponse);
    });
  });

  describe('Delivery Notes API', () => {
    it('should call getDeliveryNotes endpoint', async () => {
      const mockResponse = { status: 200, data: [{ id: 'dn-1', deliveryNumber: 'BL-2026-0001' }] };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.getDeliveryNotes();

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/delivery-notes');
      expect(res).toEqual(mockResponse);
    });

    it('should call createDeliveryNote with payload', async () => {
      const dto: CreateDeliveryNoteDto = {
        customerId: 'cust-1',
        lineItems: [
          { description: 'Item B', quantity: 3, unitPrice: 150, taxRate: 20, discountPercent: 0 },
        ],
      };
      const mockResponse = { status: 201, data: { id: 'dn-1', ...dto } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.createDeliveryNote(dto);

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/delivery-notes', {
        method: 'POST',
        body: dto,
      });
      expect(res).toEqual(mockResponse);
    });

    it('should call shipDeliveryNote endpoint with idempotency header', async () => {
      const mockResponse = { status: 200, data: { id: 'dn-1', status: 'SHIPPED' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.shipDeliveryNote('dn-1', 'key-123');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/delivery-notes/dn-1/ship', {
        method: 'POST',
        headers: { 'idempotency-key': 'key-123' },
      });
      expect(res).toEqual(mockResponse);
    });

    it('should call deliverDeliveryNote endpoint with idempotency header', async () => {
      const mockResponse = { status: 200, data: { id: 'dn-1', status: 'DELIVERED' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.deliverDeliveryNote('dn-1', 'key-456');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/delivery-notes/dn-1/deliver', {
        method: 'POST',
        headers: { 'idempotency-key': 'key-456' },
      });
      expect(res).toEqual(mockResponse);
    });

    it('should call cancelDeliveryNote endpoint', async () => {
      const mockResponse = { status: 200, data: { id: 'dn-1', status: 'CANCELLED' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.cancelDeliveryNote('dn-1');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/delivery-notes/dn-1/cancel', {
        method: 'POST',
        headers: undefined,
      });
      expect(res).toEqual(mockResponse);
    });
  });

  describe('Payments API', () => {
    it('should call getPayments endpoint with query when invoiceId is passed', async () => {
      const mockResponse = { status: 200, data: [{ id: 'pay-1', amount: 200 }] };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.getPayments('inv-1');

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/payments?invoiceId=inv-1');
      expect(res).toEqual(mockResponse);
    });

    it('should call createPayment with payload', async () => {
      const dto: CreatePaymentDto = {
        invoiceId: 'inv-1',
        amount: 300,
        paymentMethod: 'CASH',
      };
      const mockResponse = { status: 201, data: { id: 'pay-1', ...dto } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.createPayment(dto);

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/payments', {
        method: 'POST',
        body: dto,
      });
      expect(res).toEqual(mockResponse);
    });

    it('should call cancelPayment endpoint', async () => {
      const dto = { reason: 'Duplicate payment' };
      const mockResponse = { status: 200, data: { id: 'pay-1', status: 'CANCELLED' } };
      (ApiClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const res = await SalesApiClient.cancelPayment('pay-1', dto);

      expect(ApiClient.request).toHaveBeenCalledWith('/nexus/payments/pay-1/cancel', {
        method: 'POST',
        body: dto,
      });
      expect(res).toEqual(mockResponse);
    });
  });
});
