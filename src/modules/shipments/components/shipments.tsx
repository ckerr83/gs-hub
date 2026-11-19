'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Wine } from '@/modules/wine-database/types';
import { wineRequest } from '@/modules/wine-database/lib/api';
import type { Expense, Shipment, ShipmentWine, Snapshot } from '../types';
import { calculate } from '../calculations/shipment-costing';
import { completed, duplicateShipment, editable, newShipment, type Action } from '../data/model';
import { shipmentXlsx, shipmentExportName, XLSX_MIME } from '../data/shipment-excel';
import { useShipmentI18n } from '../i18n';
import { ShipmentHeader, ShipmentSelector, ShipmentLifecycle } from './shipment-header';
import { ShipmentSummary } from './shipment-summary';
import { PalletConfiguration, WineEditor, WinePicker } from './pallet-configuration';
import { ShipmentCosts, ExpenseEditor } from './shipment-costs';
import { ForecastActual } from './forecast-actual';
import { ShipmentHistory } from './shipment-history';
import { ShipmentSettings } from './shipment-settings';
import { Dialog, Field } from './dialog';
const tabs = ['Pallet configuration', 'Shipment costs', 'Forecast vs actual', 'Saved versions & notes'];
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function Shipments() {
    const { t } = useShipmentI18n();
    const [shipments, setShipments] = useState<Shipment[]>([]), [wines, setWines] = useState<Wine[]>([]), [draft, setDraft] = useState<Shipment | null>(null), [canWrite, setCanWrite] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [wineError, setWineError] = useState(false), [view, setView] = useState<'active' | 'completed'>('active'), [tab, setTab] = useState(tabs[0]), [modal, setModal] = useState(''), [wineEdit, setWineEdit] = useState<ShipmentWine | null>(null), [expenseEdit, setExpenseEdit] = useState<Expense | null>(null), [settings, setSettings] = useState<Shipment | null>(null), [version, setVersion] = useState<Snapshot | null>(null), [date, setDate] = useState(''), [note, setNote] = useState('');
    const saved = shipments.find(s => s.id === draft?.id), dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        setCanWrite(false);
        try {
            // The catalogue and shipments are independent: start both together.
            // A catalogue failure must not prevent existing shipments opening.
            const [result, catalogue] = await Promise.allSettled([
                wineRequest<{ shipments: Shipment[]; canWrite: boolean }>('/api/shipments'),
                wineRequest<{ wines: Wine[] }>('/api/wine-database'),
            ]);
            if (result.status === 'rejected') throw result.reason;
            setShipments(result.value.shipments);
            setCanWrite(result.value.canWrite);
            const requested = new URLSearchParams(window.location.search).get('shipment');
            const first = result.value.shipments.find(s => s.id === requested) ?? result.value.shipments.find(s => !completed(s)) ?? result.value.shipments[0] ?? null;
            const requestedVersion = new URLSearchParams(window.location.search).get('version');
            const snapshot = first?.snapshots.find(v => v.id === requestedVersion);
            if (snapshot) { setVersion(snapshot); setModal('version'); }
            setDraft(first ? structuredClone(first) : null);
            setView(first && completed(first) ? 'completed' : 'active');
            setWines(catalogue.status === 'fulfilled' ? catalogue.value.wines : []);
            setWineError(catalogue.status === 'rejected');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'unavailable');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
    useEffect(() => { if (!dirty)
        return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
    const change = (s: Shipment) => { setDraft(s); setMessage(''); setError(''); };
    const maySwitch = () => !dirty || window.confirm(t('Discard unsaved changes?'));
    async function persist(action: Action = 'save', extra: {
        date?: string;
        note?: string;
    } = {}) {
        if (!draft || busy)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const result = await wineRequest<Shipment>(draft.version ? `/api/shipments/${encodeURIComponent(draft.id)}` : '/api/shipments', draft.version ? 'PUT' : 'POST', { shipment: draft, action, ...extra });
            setShipments(old => [...old.filter(s => s.id !== result.id), result]);
            setDraft(structuredClone(result));
            setView(completed(result) ? 'completed' : 'active');
            setMessage('Shipment saved.');
            setModal('');
            if (action === 'actuals')
                setTab(tabs[1]);
            if (action === 'partial' || action === 'complete')
                setTab(tabs[2]);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'write');
        }
        finally {
            setBusy(false);
        }
    }
    async function action(key: string) {
        if (key === 'new') {
            if (!maySwitch())
                return;
            setSettings(newShipment());
            setModal('settings');
            return;
        }
        if (!draft)
            return;
        if (key === 'settings') {
            if (!canWrite || !editable(draft))
                return;
            setSettings(structuredClone(draft));
            setModal('settings');
            return;
        }
        if (key === 'duplicate') {
            if (!maySwitch())
                return;
            setSettings(duplicateShipment(draft));
            setModal('settings');
            return;
        }
        if (key === 'export') {
            try {
                const bytes = await shipmentXlsx(draft);
                download(new Blob([bytes], { type: XLSX_MIME }), shipmentExportName(draft));
            }
            catch {
                setError('Export failed. Check the purchase details.');
            }
            return;
        }
        if (dirty && ['land','note','revise','actuals'].includes(key)) { setError('Save changes before this action.'); return; }
        if (key === 'land') {
            setDate('');
            setModal('land');
            return;
        }
        if (key === 'note') {
            setNote('');
            setModal('note');
            return;
        }
        if (dirty && ['revise', 'actuals'].includes(key) && !maySwitch())
            return;
        await persist(key as Action);
    }
    const cost = draft ? calculate(draft) : null;
    const noChange = () => { };
    return <main id="main-content" className="shipments-page">
    <ShipmentHeader shipment={draft} canWrite={canWrite} busy={busy} dirty={dirty} onAction={key => void action(key)}/>
    {loading && <p className="sh-notice" role="status">{t('Loading…')}</p>}
    {error && <div className="sh-error" role="alert"><p>{t(error)}</p><div className="sh-actions">{error === 'auth' ? <Link href="/sign-in">{t('Sign in')}</Link> : <button className="sh-button" disabled={busy} onClick={() => { if (maySwitch())
        void load(); }}>{t(dirty ? 'Reload saved data' : 'Retry')}</button>}{draft && <button className="sh-button" onClick={() => download(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }), `${draft.name || 'shipment'}-draft.json`)}>{t('Download draft backup')}</button>}</div></div>}
    {message && <p className="sh-success" role="status">{t(message)}</p>}
    {!loading && <><div className="sh-toolbar"><ShipmentSelector shipments={shipments} shipment={draft} view={view} onView={next => { if (!maySwitch())
        return; setView(next); const s = shipments.find(s => completed(s) === (next === 'completed')); setDraft(s ? structuredClone(s) : null); }} onSelect={id => { if (!maySwitch())
        return; const s = shipments.find(s => s.id === id); setDraft(s ? structuredClone(s) : null); }}/>{draft && <ShipmentLifecycle shipment={draft} onAction={key => void action(key)} disabled={!canWrite || busy}/>}</div>{draft && cost ? <><div className="sh-save-status">{dirty ? t('Unsaved changes') : draft.version ? `${t('Saved')} · v${draft.version}` : t('Draft')}{!editable(draft) && <span>{t('Forecast locked; open a revision or actual costs to edit.')}</span>}</div><ShipmentSummary shipment={draft} cost={cost}/><div className="sh-tabs" role="tablist" aria-label={t('Shipments')}>{tabs.map(x => <button key={x} role="tab" aria-selected={tab === x} aria-controls="shipment-panel" onClick={() => setTab(x)}>{t(x)}</button>)}</div><div id="shipment-panel" role="tabpanel" aria-label={t(tab)}>{tab === tabs[0] && <><PalletConfiguration shipment={draft} cost={cost} disabled={!canWrite || busy} onChange={change} onEdit={w => { setWineEdit(w); setModal('wine'); }} onAdd={() => setModal('picker')}/>{wineError && <p className="sh-error">{t('Wine data unavailable. Retry loading the page.')}</p>}</>}{tab === tabs[1] && <ShipmentCosts shipment={draft} disabled={!canWrite || busy} onEdit={e => { setExpenseEdit(e); setModal('expense'); }} onAdd={() => { setExpenseEdit({ id: crypto.randomUUID(), name: '', category: 'International freight', amount: null, vat: null, currency: 'THB', fx: 1, pallet: 'all', status: 'estimate', note: '' }); setModal('expense'); }}/>}{tab === tabs[2] && <ForecastActual shipment={draft} disabled={!canWrite || busy} onChange={change} onAction={key => void action(key)}/>} {tab === tabs[3] && <ShipmentHistory shipment={draft} disabled={!canWrite || busy} onVersion={v => { setVersion(v); setModal('version'); }} onNote={() => void action('note')}/>}</div></> : !error && <section className="sh-panel sh-empty"><h2>{t(view === 'completed' ? 'No completed shipments' : 'No shipments')}</h2><p>{t(shipments.length ? 'No matching shipment in this section.' : 'Create a shipment to start planning.')}</p></section>}</>}
    {modal === 'settings' && settings && <ShipmentSettings shipment={settings} onSave={s => { change(s); setView(completed(s) ? 'completed' : 'active'); }} onClose={() => setModal('')}/>}
    {modal === 'picker' && draft && <WinePicker shipment={draft} wines={wines} onChange={change} onClose={() => setModal('')}/>}
    {modal === 'wine' && draft && wineEdit && <WineEditor wine={wineEdit} shipment={draft} onClose={() => setModal('')} onSave={w => change({ ...draft, wines: draft.wines.map(x => x.id === w.id ? w : x) })} onRemove={() => change({ ...draft, wines: draft.wines.filter(x => x.id !== wineEdit.id) })}/>}
    {modal === 'expense' && draft && expenseEdit && <ExpenseEditor expense={expenseEdit} shipment={draft} onClose={() => setModal('')} onSave={e => change({ ...draft, expenses: draft.expenses.some(x => x.id === e.id) ? draft.expenses.map(x => x.id === e.id ? e : x) : [...draft.expenses, e] })} onRemove={() => change({ ...draft, expenses: draft.expenses.filter(x => x.id !== expenseEdit.id) })}/>}
    {modal === 'land' && <Dialog title={t('Mark as landed')} onClose={() => setModal('')}><form className="sh-form" onSubmit={e => { e.preventDefault(); void persist('land', { date: String(new FormData(e.currentTarget).get('arrivalDate') ?? '') }); }}><p>{t('Original forecast stays unchanged. Actual invoices may be entered after landing.')}</p>{error && <p className="sh-error" role="alert">{t(error)}</p>}<Field name="arrivalDate" label={t('Arrival date')} type="date" required value={date} onChange={setDate}/><footer><button className="sh-button sh-primary" disabled={busy}>{t('Save')}</button></footer></form></Dialog>}
    {modal === 'note' && <Dialog title={t('Add note')} onClose={() => setModal('')}><form className="sh-form" onSubmit={e => { e.preventDefault(); void persist('note', { note }); }}><label className="sh-field">{t('Note')}<textarea required maxLength={5000} value={note} onChange={e => setNote(e.target.value)}/></label><footer><button className="sh-button sh-primary" disabled={busy}>{t('Save')}</button></footer></form></Dialog>}
    {modal === 'version' && version && <Dialog title={version.name} onClose={() => setModal('')}><div className="sh-version-preview"><ShipmentSummary shipment={{ ...version.data, version: 0, updatedAt: null, snapshots: [], notes: [] }} cost={version.calculation ?? calculate(version.data)}/><PalletConfiguration shipment={{ ...version.data, version: 0, updatedAt: null, snapshots: [], notes: [] }} cost={version.calculation ?? calculate(version.data)} disabled onChange={noChange} onEdit={noChange} onAdd={noChange}/><ShipmentCosts shipment={{ ...version.data, version: 0, updatedAt: null, snapshots: [], notes: [] }} disabled onEdit={noChange} onAdd={noChange}/><button className="sh-button" onClick={() => download(new Blob([JSON.stringify(version, null, 2)], { type: 'application/json' }), `${version.name}.json`)}>{t('Download JSON')}</button></div></Dialog>}
  </main>;
}
