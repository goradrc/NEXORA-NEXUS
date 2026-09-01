export interface DocumentPdfData {
  title: string;
  documentNumber: string;
  date: Date;
  dueDate?: Date;
  organization: {
    name: string;
    legalName?: string;
    taxId?: string;
    address?: string;
    email?: string;
  };
  customer: {
    name: string;
    companyName?: string;
    taxNumber?: string;
    address?: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    totalPrice: number;
  }>;
  totalUntaxed: number;
  totalTax: number;
  totalAmount: number;
  currency?: string;
}

export class PdfService {
  public static generateDocumentHtml(data: DocumentPdfData): string {
    const currency = data.currency || 'EUR';
    const itemsHtml = data.lineItems
      .map(
        item => `
        <tr>
          <td>${item.description}</td>
          <td style="text-align: right;">${item.quantity}</td>
          <td style="text-align: right;">${item.unitPrice.toFixed(2)} ${currency}</td>
          <td style="text-align: right;">${item.taxRate}%</td>
          <td style="text-align: right;">${item.totalPrice.toFixed(2)} ${currency}</td>
        </tr>`
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.title} - ${data.documentNumber}</title>
  <style>
    body { font-family: sans-serif; margin: 20px; color: #333; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .company-info { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .totals { margin-top: 20px; float: right; width: 300px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .grand-total { font-weight: bold; border-top: 2px solid #333; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <h2>${data.organization.name}</h2>
      ${data.organization.legalName ? `<p>${data.organization.legalName}</p>` : ''}
      ${data.organization.address ? `<p>${data.organization.address}</p>` : ''}
      ${data.organization.taxId ? `<p>NIF/TVA: ${data.organization.taxId}</p>` : ''}
    </div>
    <div style="text-align: right;">
      <h1>${data.title}</h1>
      <p><strong>N° :</strong> ${data.documentNumber}</p>
      <p><strong>Date :</strong> ${new Date(data.date).toLocaleDateString()}</p>
      ${data.dueDate ? `<p><strong>Échéance :</strong> ${new Date(data.dueDate).toLocaleDateString()}</p>` : ''}
    </div>
  </div>

  <div>
    <h3>Client :</h3>
    <p><strong>${data.customer.name}</strong> ${data.customer.companyName ? `(${data.customer.companyName})` : ''}</p>
    ${data.customer.address ? `<p>${data.customer.address}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align: right;">Qté</th>
        <th style="text-align: right;">P.U. HT</th>
        <th style="text-align: right;">TVA</th>
        <th style="text-align: right;">Total TTC</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Total HT :</span> <span>${data.totalUntaxed.toFixed(2)} ${currency}</span></div>
    <div><span>Total TVA :</span> <span>${data.totalTax.toFixed(2)} ${currency}</span></div>
    <div class="grand-total"><span>Total TTC :</span> <span>${data.totalAmount.toFixed(2)} ${currency}</span></div>
  </div>
</body>
</html>
    `.trim();
  }
}
