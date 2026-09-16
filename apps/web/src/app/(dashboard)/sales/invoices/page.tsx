'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CreateInvoiceDto, InvoiceDto } from '@nexora/nexus';
import { useAuth } from '../../../../context/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import { SalesApiClient } from '../../../../services/sales-api';
import { InvoiceModal } from '../../../../components/sales/InvoiceModal';
import { Button } from '../../../../components/ui/Button';
import styles from '../../../../components/sales/invoices.module.css';

export default function InvoicesPage() {
  const { user, token } = useAuth();
  const canRead = usePermissions('nexus:invoices:read');
  const canCreate = usePermissions('nexus:invoices:create');
  const canUpdate = usePermissions('nexus:invoices:update');
  const canManage = usePermissions('nexus:invoices:manage');
  if (!user || !canRead) return <p role="alert">Accès non autorisé aux factures.</p>;
  return <InvoiceWorkspace key={JSON.stringify([user.userId, user.organizationId, token, canCreate, canUpdate, canManage])}
    canCreate={canCreate} canUpdate={canUpdate} canManage={canManage} />;
}
function InvoiceWorkspace({ canCreate, canUpdate, canManage }: { canCreate: boolean; canUpdate: boolean; canManage: boolean }) {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<InvoiceDto | null>(null);
  const reading = useRef(false);
  const mutating = useRef(false);
  const alive = useRef(true);
  const keys = useRef(new Map<string, string>());
  const load = useCallback(async (nextOffset: number) => {
    if (reading.current || !alive.current) return;
    reading.current = true; setLoading(true); setError('');
    try {
      const response = await SalesApiClient.getInvoices(nextOffset);
      if (!alive.current) return;
      if (response.error || !response.data) {
        setError(response.error || 'Réponse du serveur invalide.');
      } else {
        setInvoices(response.data); setOffset(nextOffset); setHasNext(response.data.length === 100);
      }
    } catch { if (alive.current) setError('Impossible de charger les factures. Réessayez.'); }
    finally { reading.current = false; if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true; void load(0);
    return () => { alive.current = false; };
  }, [load]);
  const save = async (dto: CreateInvoiceDto, key: string) => {
    if (mutating.current || reading.current || (selected ? !canUpdate || selected.status !== 'DRAFT' : !canCreate)) return false;
    mutating.current = true; setBusy(true); setError('');
    try {
      const response = selected
        ? await SalesApiClient.updateInvoice(selected.id, dto, key)
        : await SalesApiClient.createInvoice({ ...dto, idempotencyKey: key });
      if (!alive.current) return false;
      if (response.error || !response.data) { setError(response.error || 'Enregistrement non confirmé.'); return false; }
      setModalOpen(false);
      // Show the acknowledged server result even if the subsequent refresh fails.
      setInvoices(current => selected ? current.map(i => i.id === response.data!.id ? response.data! : i) : current);
      await load(selected ? offset : 0);
      return true;
    } catch { if (alive.current) setError('Enregistrement non confirmé. Réessayez.'); return false; }
    finally { mutating.current = false; if (alive.current) setBusy(false); }
  };
  const transition = async (invoice: InvoiceDto, action: 'issue' | 'cancel') => {
    if (!canManage || mutating.current || reading.current) return;
    if (action === 'issue' ? invoice.status !== 'DRAFT' : ['PAID', 'CANCELLED'].includes(invoice.status)) return;
    if (!window.confirm(action === 'issue' ? 'Émettre cette facture ? Cette action peut mettre à jour le stock et le solde client.' : 'Annuler cette facture ? Cette action peut mettre à jour le stock et le solde client.')) return;
    const operation = action + ':' + invoice.id;
    if (!keys.current.has(operation)) keys.current.set(operation, crypto.randomUUID());
    mutating.current = true; setBusy(true); setError('');
    try {
      const key = keys.current.get(operation)!;
      const response = action === 'issue'
        ? await SalesApiClient.issueInvoice(invoice.id, key)
        : await SalesApiClient.cancelInvoice(invoice.id, 'Annulation depuis les factures de vente', key);
      if (!alive.current) return;
      if (response.error || !response.data) { setError(response.error || 'Action non confirmée. Réessayez.'); return; }
      keys.current.delete(operation);
      setInvoices(current => current.map(i => i.id === invoice.id ? response.data! : i));
      await load(offset);
    } catch { if (alive.current) setError('Action non confirmée. Réessayez.'); }
    finally { mutating.current = false; if (alive.current) setBusy(false); }
  };
  const visible = invoices.filter(i => (status === 'ALL' || i.status === status) &&
    (i.invoiceNumber + ' ' + i.customerId).toLowerCase().includes(search.toLowerCase()));
  const issued = invoices.filter(i => ['UNPAID', 'PARTIAL', 'PAID'].includes(i.status));
  const amount = (value: number) => Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const labels: Record<string, string> = { DRAFT: 'Brouillon', UNPAID: 'Non payée', PARTIAL: 'Partiellement payée', PAID: 'Payée', CANCELLED: 'Annulée' };
  return <section className={styles.workspace}>
    <header className="flex flex-wrap justify-between items-center gap-3">
      <div><h1 className="text-2xl font-bold">Factures de vente</h1><p className="text-gray-600">Brouillons, émission et suivi des soldes.</p></div>
      {canCreate && <Button disabled={loading || busy} onClick={() => { setSelected(null); setModalOpen(true); }}>Nouveau brouillon</Button>}
    </header>
    <p className="text-sm text-gray-600">Les encaissements ne sont pas encore disponibles sur cet écran.</p>
    {error && <div role="alert" className="border border-red-300 rounded p-3 text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      {[['Total émis', 'totalAmount'], ['Encaissé', 'amountPaid'], ['Reste dû', 'amountDue']].map(([label, field]) =>
        <div key={field} className="border rounded p-4 bg-white"><p>{label} — page courante</p>
          <strong className="text-xl">{amount(issued.reduce((total, i) => total + Number(i[field as 'totalAmount' | 'amountPaid' | 'amountDue']), 0))}</strong>
        </div>)}
    </div>
    <p className="text-sm text-gray-600">Totaux hors brouillons et factures annulées. Recherche et filtres sur les 100 factures de la page.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-48">Numéro ou identifiant du client
        <input className="block w-full border rounded p-2 focus:ring-2 focus:ring-blue-500" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
      <label>Statut
        <select className="block border rounded p-2" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ALL">Tous les statuts</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <Button variant="outline" disabled={loading || busy} onClick={() => load(offset)}>Actualiser</Button>
    </div>
    {loading && <p role="status">Chargement des factures…</p>}
    <div className="overflow-x-auto border rounded bg-white" aria-busy={loading || busy}>
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-100"><tr>{['Facture', 'Client (identifiant)', 'Statut', 'Échéance', 'Total', 'Payé', 'Reste dû', 'Actions'].map(h => <th className="p-3" key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{visible.map(invoice => <tr className="border-t" key={invoice.id}>
          <td className="p-3"><code>{invoice.invoiceNumber}</code></td><td className="p-3">{invoice.customerId}</td>
          <td className="p-3">{labels[invoice.status] || invoice.status}</td>
          <td className="p-3">{new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</td>
          <td className="p-3">{amount(invoice.totalAmount)}</td><td className="p-3">{amount(invoice.amountPaid)}</td><td className="p-3">{amount(invoice.amountDue)}</td>
          <td className="p-3"><div className="flex gap-2">
            <Button variant="outline" disabled={busy || loading} onClick={() => { setSelected(invoice); setModalOpen(true); }}>{canUpdate && invoice.status === 'DRAFT' ? 'Modifier' : 'Consulter'}</Button>
            {canManage && invoice.status === 'DRAFT' && <Button disabled={busy || loading} onClick={() => transition(invoice, 'issue')}>Émettre</Button>}
            {canManage && !['PAID', 'CANCELLED'].includes(invoice.status) && <Button variant="danger" disabled={busy || loading} onClick={() => transition(invoice, 'cancel')}>Annuler</Button>}
          </div></td>
        </tr>)}</tbody>
      </table>
      {!loading && !visible.length && <p className="p-6">{error ? 'Données indisponibles.' : 'Aucune facture trouvée sur cette page.'}</p>}
    </div>
    <nav aria-label="Pagination des factures" className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={loading || busy || offset === 0} onClick={() => load(Math.max(0, offset - 100))}>Précédent</Button>
      <span>Page {offset / 100 + 1}</span>
      <Button variant="outline" disabled={loading || busy || !hasNext} onClick={() => load(offset + 100)}>Suivant</Button>
    </nav>
    <InvoiceModal isOpen={modalOpen} onClose={() => { if (!mutating.current) setModalOpen(false); }} initialData={selected}
      readOnly={selected ? !canUpdate : !canCreate} onSave={save} />
  </section>;
}
