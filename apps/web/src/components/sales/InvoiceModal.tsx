'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { CreateInvoiceDto, InvoiceDto } from '@nexora/nexus';
import styles from './invoices.module.css';
import { Button } from '../ui/Button';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateInvoiceDto, key: string) => Promise<boolean>;
  initialData?: InvoiceDto | null;
  readOnly?: boolean;
}
const blankLine = () => ({ productServiceId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0, discountPercent: 0 });
const inputClass = 'w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500';
export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, onSave, initialData, readOnly = false }) => {
  const [data, setData] = useState<CreateInvoiceDto>({ customerId: '', dueDate: '', lineItems: [blankLine()] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter(el => !el.closest('fieldset:disabled'));
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending.current) onClose();
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [isOpen, onClose]);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const locked = readOnly || (!!initialData && initialData.status !== 'DRAFT');
  useEffect(() => {
    if (!isOpen) return;
    setData(initialData ? {
      customerId: initialData.customerId, dueDate: initialData.dueDate.slice(0, 10),
      lineItems: initialData.lineItems.map(({ productServiceId, description, quantity, unitPrice, taxRate, discountPercent }) =>
        ({ productServiceId, description, quantity, unitPrice, taxRate, discountPercent })),
    } : { customerId: '', dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), lineItems: [blankLine()] });
    attempt.current = null; setError('');
  }, [isOpen, initialData]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current || locked) return;
    if (!data.customerId.trim() || !data.dueDate || !Number.isFinite(Date.parse(data.dueDate))) {
      setError('Renseignez le client et une date valide.'); return;
    }
    if (!data.lineItems.length || data.lineItems.length > 200 || data.lineItems.some(l =>
      !l.productServiceId?.trim() || !l.description.trim() ||
      !Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 1e9 ||
      !Number.isFinite(l.unitPrice) || l.unitPrice < 0 || l.unitPrice > 1e9 ||
      !Number.isFinite(l.taxRate ?? 0) || (l.taxRate ?? 0) < 0 || (l.taxRate ?? 0) > 100 ||
      !Number.isFinite(l.discountPercent ?? 0) || (l.discountPercent ?? 0) < 0 || (l.discountPercent ?? 0) > 100)) {
      setError('Vérifiez les articles, descriptions, quantités, prix et taux (0 à 100 %).'); return;
    }
    const payload = JSON.stringify(data);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError('');
    try {
      if (!await onSave(data, attempt.current!.key)) setError('Enregistrement non confirmé. Vérifiez le message et réessayez.');
    } catch { setError('Enregistrement non confirmé. Réessayez avec les mêmes données.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const close = () => { if (!pending.current) onClose(); };
  if (!isOpen) return null;
  return <div className={styles.overlay}><div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="invoice-title" tabIndex={-1}>
    <h2 id="invoice-title">{initialData ? 'Facture ' + initialData.invoiceNumber : 'Nouveau brouillon'}</h2>
    <form onSubmit={submit}>
      {locked && <p className="mb-4 text-sm">Consultation uniquement.</p>}
      {!locked && <p className="mb-4 text-sm text-gray-600">Saisissez les identifiants du client et des articles enregistrés pour votre organisation. Les listes de sélection ne sont pas encore connectées.</p>}
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      <fieldset disabled={busy || locked} className="space-y-4">
        <label className="block">Identifiant du client
          <input className={inputClass} maxLength={100} required value={data.customerId} onChange={e => setData({ ...data, customerId: e.target.value })} />
        </label>
        <label className="block">Échéance
          <input className={inputClass} type="date" required value={data.dueDate} onChange={e => setData({ ...data, dueDate: e.target.value })} />
        </label>
        {data.lineItems.map((line, index) => <fieldset key={index} className="border rounded p-3 space-y-2">
          <legend className="font-semibold">Ligne {index + 1}</legend>
          {(['productServiceId', 'description', 'quantity', 'unitPrice', 'taxRate', 'discountPercent'] as const).map(field => {
            const labels = { productServiceId: 'Identifiant de l’article', description: 'Description', quantity: 'Quantité', unitPrice: 'Prix unitaire', taxRate: 'Taxe (%)', discountPercent: 'Remise (%)' };
            const numeric = field !== 'productServiceId' && field !== 'description';
            return <label key={field} className="block text-sm">{labels[field]}
              <input className={inputClass} type={numeric ? 'number' : 'text'} required step={numeric ? 'any' : undefined}
                min={numeric ? 0 : undefined} max={numeric ? (field === 'taxRate' || field === 'discountPercent' ? 100 : 1e9) : undefined}
                maxLength={field === 'productServiceId' ? 100 : field === 'description' ? 2000 : undefined}
                value={line[field] ?? ''} onChange={e => setData({ ...data, lineItems: data.lineItems.map((l, i) => i === index ? { ...l, [field]: numeric ? Number(e.target.value) : e.target.value } : l) })} />
            </label>;
          })}
          {!locked && <Button variant="outline" disabled={busy} onClick={() => setData({ ...data, lineItems: data.lineItems.filter((_, i) => i !== index) })}>Retirer la ligne</Button>}
        </fieldset>)}
        {!locked && <Button variant="outline" disabled={busy || data.lineItems.length >= 200} onClick={() => setData({ ...data, lineItems: [...data.lineItems, blankLine()] })}>Ajouter une ligne</Button>}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" disabled={busy} onClick={close}>Fermer</Button>
        {!locked && <Button type="submit" isLoading={busy}>Enregistrer le brouillon</Button>}
      </div>
    </form>
  </div></div>;
};
