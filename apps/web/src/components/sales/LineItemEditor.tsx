'use client';

import React from 'react';
import { LocalProduct, LocalLineItem } from '../../offline/db';

interface LineItemEditorProps {
  lines: LocalLineItem[];
  onChange: (updatedLines: LocalLineItem[]) => void;
  products: LocalProduct[];
  readOnly?: boolean;
}

export const LineItemEditor: React.FC<LineItemEditorProps> = ({
  lines,
  onChange,
  products,
  readOnly = false,
}) => {
  const handleAddLine = () => {
    if (readOnly) return;
    const defaultProduct = products[0];
    const newLine: LocalLineItem = {
      id: `line-${crypto.randomUUID()}`,
      productServiceId: defaultProduct?.id || 'prod-custom',
      description: defaultProduct?.name || 'Nouvelle prestation / article',
      quantity: 1,
      unitPrice: defaultProduct?.salePrice || 0,
      taxRate: defaultProduct?.taxRate ?? 20,
      discountPercent: 0,
      totalPrice: defaultProduct?.salePrice || 0,
    };
    onChange([...lines, newLine]);
  };

  const handleRemoveLine = (index: number) => {
    if (readOnly) return;
    const updated = lines.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  const handleProductSelect = (index: number, productId: string) => {
    if (readOnly) return;
    const selected = products.find((p) => p.id === productId);
    if (!selected) return;

    const updated = [...lines];
    const qty = updated[index].quantity || 1;
    const price = selected.salePrice || 0;
    const disc = updated[index].discountPercent || 0;
    const ht = Number((qty * price * (1 - disc / 100)).toFixed(2));

    updated[index] = {
      ...updated[index],
      productServiceId: selected.id,
      description: selected.name,
      unitPrice: price,
      taxRate: selected.taxRate ?? 20,
      totalPrice: ht,
    };

    onChange(updated);
  };

  const handleLineFieldChange = (
    index: number,
    field: keyof LocalLineItem,
    value: any
  ) => {
    if (readOnly) return;
    const updated = [...lines];
    const current = { ...updated[index], [field]: value };

    const qty = Math.max(0, typeof current.quantity === 'number' ? current.quantity : parseFloat(current.quantity) || 0);
    const price = Math.max(0, typeof current.unitPrice === 'number' ? current.unitPrice : parseFloat(current.unitPrice) || 0);
    const disc = Math.min(100, Math.max(0, typeof current.discountPercent === 'number' ? current.discountPercent : parseFloat(current.discountPercent) || 0));

    const lineHT = Number((qty * price * (1 - disc / 100)).toFixed(2));

    updated[index] = {
      ...current,
      quantity: qty,
      unitPrice: price,
      discountPercent: disc,
      totalPrice: lineHT,
    };

    onChange(updated);
  };

  // Totals calculation
  const totalUntaxed = lines.reduce((sum, l) => sum + (l.totalPrice || 0), 0);
  const totalTax = lines.reduce(
    (sum, l) => sum + Number(((l.totalPrice || 0) * ((l.taxRate || 0) / 100)).toFixed(2)),
    0
  );
  const totalAmount = Number((totalUntaxed + totalTax).toFixed(2));

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
          Lignes d'Articles & Prestations *
        </label>
        {!readOnly && (
          <button
            type="button"
            onClick={handleAddLine}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: '#0f172a',
              color: '#ffffff',
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ➕ Ajouter une Ligne
          </button>
        )}
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#475569' }}>
              <th style={{ padding: '8px 12px', width: '30%' }}>ARTICLE / SÉLECTION</th>
              <th style={{ padding: '8px 12px', width: '12%' }}>QTE</th>
              <th style={{ padding: '8px 12px', width: '15%' }}>PRIX HT (€)</th>
              <th style={{ padding: '8px 12px', width: '12%' }}>TVA (%)</th>
              <th style={{ padding: '8px 12px', width: '12%' }}>REM. (%)</th>
              <th style={{ padding: '8px 12px', width: '15%' }}>TOTAL HT (€)</th>
              {!readOnly && <th style={{ padding: '8px 12px', width: '4%' }}></th>}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={readOnly ? 6 : 7}
                  style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}
                >
                  Aucune ligne d'article. Cliquez sur "Ajouter une Ligne".
                </td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={line.id || index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px' }}>
                    {!readOnly && products.length > 0 && (
                      <select
                        value={line.productServiceId}
                        onChange={(e) => handleProductSelect(index, e.target.value)}
                        style={{
                          width: '100%',
                          marginBottom: 4,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          fontSize: 12,
                        }}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.reference} - {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      disabled={readOnly}
                      value={line.description}
                      onChange={(e) => handleLineFieldChange(index, 'description', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>

                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="number"
                      min="1"
                      disabled={readOnly}
                      value={line.quantity}
                      onChange={(e) => handleLineFieldChange(index, 'quantity', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>

                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={readOnly}
                      value={line.unitPrice}
                      onChange={(e) => handleLineFieldChange(index, 'unitPrice', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>

                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="number"
                      step="0.1"
                      disabled={readOnly}
                      value={line.taxRate}
                      onChange={(e) => handleLineFieldChange(index, 'taxRate', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>

                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      disabled={readOnly}
                      value={line.discountPercent}
                      onChange={(e) => handleLineFieldChange(index, 'discountPercent', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </td>

                  <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                    {line.totalPrice.toLocaleString('fr-FR', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </td>

                  {!readOnly && (
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals Summary Footer */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 24,
          fontSize: 13,
        }}
      >
        <div>
          Sous-total HT : <strong>{totalUntaxed.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong>
        </div>
        <div>
          Total TVA : <strong>{totalTax.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0284c7' }}>
          Total TTC : {totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
        </div>
      </div>
    </div>
  );
};
