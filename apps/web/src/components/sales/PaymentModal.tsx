'use client';

import React, { useState, useEffect } from 'react';
import { LocalInvoice, LocalPayment } from '../../offline/db';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<LocalPayment>) => void;
  invoice: LocalInvoice | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  invoice,
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<LocalPayment['paymentMethod']>('BANK_TRANSFER');
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoice) {
      setAmount(invoice.amountDue || 0);
      setPaymentMethod('BANK_TRANSFER');
      setReferenceCode('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setError(null);
    }
  }, [invoice, isOpen]);

  if (!isOpen || !invoice) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Le montant du paiement doit être supérieur à 0.');
      return;
    }

    if (numericAmount > invoice.amountDue + 0.001) {
      setError(
        `Sur-paiement interdit ! Le montant saisi (${numericAmount} €) dépasse le reste dû (${invoice.amountDue} €).`
      );
      return;
    }

    onSave({
      amount: numericAmount,
      paymentMethod,
      referenceCode,
      paymentDate: new Date(paymentDate).toISOString(),
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 8,
          width: '100%',
          maxWidth: 500,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            💳 Enregistrer un Règlement
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Invoice Financial Recap */}
          <div
            style={{
              marginBottom: 20,
              padding: 14,
              backgroundColor: '#f1f5f9',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Facture N° :</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{invoice.invoiceNumber}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Total TTC :</span>
              <span style={{ fontWeight: 600 }}>
                {invoice.totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#64748b' }}>Déjà Payé :</span>
              <span style={{ fontWeight: 600, color: '#16a34a' }}>
                {invoice.amountPaid.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: 6,
                borderTop: '1px solid #cbd5e1',
                fontWeight: 700,
              }}
            >
              <span style={{ color: '#0f172a' }}>Reste à Payer :</span>
              <span style={{ color: '#d97706', fontSize: 15 }}>
                {invoice.amountDue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Montant à encaisser (€) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={invoice.amountDue}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 15,
                fontWeight: 700,
                color: '#0f172a',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Moyen de Paiement *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as LocalPayment['paymentMethod'])}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                backgroundColor: '#ffffff',
              }}
            >
              <option value="BANK_TRANSFER">Virement Bancaire</option>
              <option value="CARD">Carte Bancaire</option>
              <option value="CASH">Espèces</option>
              <option value="CHECK">Chèque</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Référence / N° de pièce (Virement, Chèque...)
            </label>
            <input
              type="text"
              placeholder="ex: VIR-8492042"
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Date d'Encaissement *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
              }}
            />
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Valider le Règlement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
