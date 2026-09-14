'use client';

import React, { useState, useEffect } from 'react';
import { DeliveryNoteDto, CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from '@nexora/nexus';
import { LocalCustomer, LocalProduct, LocalLineItem } from '../../offline/db';
import { LineItemEditor } from './LineItemEditor';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface DeliveryNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any, idempotencyKey?: string) => Promise<void> | void;
  initialData?: DeliveryNoteDto | null;
  customers: LocalCustomer[];
  products: LocalProduct[];
  loading?: boolean;
}

export const DeliveryNoteModal: React.FC<DeliveryNoteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  customers,
  products,
  loading = false,
}) => {
  const [customerId, setCustomerId] = useState<string>('');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [carrierName, setCarrierName] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [lineItems, setLineItems] = useState<LocalLineItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setCustomerId(initialData.customerId || '');
        setShippingAddress(initialData.shippingAddress || '');
        setCarrierName(initialData.carrierName || '');
        setTrackingNumber(initialData.trackingNumber || '');
        setNotes(initialData.notes || '');
        setLineItems(
          (initialData.lineItems || []).map((l, index) => ({
            id: l.id || `line-${index}`,
            productServiceId: l.productServiceId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            discountPercent: l.discountPercent,
            totalPrice: l.totalPrice,
          }))
        );
      } else {
        setCustomerId(customers[0]?.id || '');
        setShippingAddress('');
        setCarrierName('');
        setTrackingNumber('');
        setNotes('');
        const defaultProduct = products[0];
        const initialLine: LocalLineItem = defaultProduct
          ? {
              id: `line-${crypto.randomUUID()}`,
              productServiceId: defaultProduct.id,
              description: defaultProduct.name,
              quantity: 1,
              unitPrice: defaultProduct.salePrice,
              taxRate: defaultProduct.taxRate ?? 20,
              discountPercent: 0,
              totalPrice: defaultProduct.salePrice,
            }
          : {
              id: `line-${crypto.randomUUID()}`,
              productServiceId: undefined,
              description: 'Article à livrer',
              quantity: 1,
              unitPrice: 0,
              taxRate: 20,
              discountPercent: 0,
              totalPrice: 0,
            };
        setLineItems([initialLine]);
      }
      setIdempotencyKey(crypto.randomUUID());
      setErrors({});
    }
  }, [isOpen, initialData, customers, products]);

  const isLocked = !!initialData && initialData.status !== 'DRAFT';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!initialData && !customerId) {
      newErrors.customerId = 'Veuillez sélectionner un client.';
    }

    if (!lineItems || lineItems.length === 0) {
      newErrors.lineItems = 'Le bon de livraison doit contenir au moins une ligne d’article.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payloadLineItems = lineItems.map((line) => ({
      productServiceId: line.productServiceId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      discountPercent: line.discountPercent,
    }));

    if (initialData) {
      const updateDto: UpdateDeliveryNoteDto = {
        shippingAddress: shippingAddress || undefined,
        carrierName: carrierName || undefined,
        trackingNumber: trackingNumber || undefined,
        notes: notes || undefined,
        lineItems: payloadLineItems,
      };
      onSave(updateDto, idempotencyKey);
    } else {
      const createDto: CreateDeliveryNoteDto = {
        customerId,
        shippingAddress: shippingAddress || undefined,
        carrierName: carrierName || undefined,
        trackingNumber: trackingNumber || undefined,
        notes: notes || undefined,
        lineItems: payloadLineItems,
        idempotencyKey,
      };
      onSave(createDto, idempotencyKey);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div>
          <div>{initialData ? `Bon de Livraison : ${initialData.deliveryNumber}` : 'Nouveau Bon de Livraison'}</div>
          {isLocked && (
            <span style={{ fontSize: 12, color: '#0284c7', fontWeight: 600 }}>
              🔒 Document verrouillé (Statut : {initialData.status})
            </span>
          )}
        </div>
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          {!isLocked && (
            <Button variant="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Enregistrement...' : initialData ? 'Mettre à jour le brouillon' : 'Créer le Bon de Livraison'}
            </Button>
          )}
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label
              htmlFor="delivery-customer-select"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Client Destinataire *
            </label>
            <select
              id="delivery-customer-select"
              disabled={!!initialData || isLocked}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                if (errors.customerId) setErrors((prev) => ({ ...prev, customerId: '' }));
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: `1px solid ${errors.customerId ? '#ef4444' : '#cbd5e1'}`,
                fontSize: 14,
                backgroundColor: initialData ? '#f1f5f9' : '#ffffff',
                boxSizing: 'border-box',
              }}
            >
              <option value="">-- Sélectionner un client --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} - ` : ''}{c.name} {c.companyName ? `(${c.companyName})` : ''}
                </option>
              ))}
            </select>
            {errors.customerId && (
              <span style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'block' }}>
                {errors.customerId}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="delivery-carrier"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Transporteur
            </label>
            <input
              id="delivery-carrier"
              type="text"
              placeholder="Ex: DHL, Chronopost, Interne..."
              disabled={isLocked}
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="delivery-tracking"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              N° de Suivi
            </label>
            <input
              id="delivery-tracking"
              type="text"
              placeholder="Ex: TRK-987654321"
              disabled={isLocked}
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label
              htmlFor="delivery-address"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Adresse de Livraison
            </label>
            <input
              id="delivery-address"
              type="text"
              placeholder="Adresse de livraison complète"
              disabled={isLocked}
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="delivery-notes"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
            >
              Notes & Instructions
            </label>
            <input
              id="delivery-notes"
              type="text"
              placeholder="Instructions pour le livreur ou le client"
              disabled={isLocked}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Line Item Editor */}
        <LineItemEditor
          lines={lineItems}
          onChange={(updatedLines) => {
            if (isLocked) return;
            setLineItems(updatedLines);
            if (errors.lineItems) setErrors((prev) => ({ ...prev, lineItems: '' }));
          }}
          products={products}
          readOnly={isLocked}
        />
        {errors.lineItems && (
          <span style={{ fontSize: 12, color: '#ef4444', marginBottom: 12, display: 'block' }}>
            {errors.lineItems}
          </span>
        )}
      </form>
    </Modal>
  );
};
