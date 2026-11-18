'use client';
import type { Shipment } from '../types';
import { useShipmentI18n } from '../i18n';
import { completed, editable } from '../data/model';
export function ShipmentHeader({ shipment, canWrite, busy, dirty, onAction }: {
    shipment: Shipment | null;
    canWrite: boolean;
    busy: boolean;
    dirty: boolean;
    onAction: (action: string) => void;
}) { const { t } = useShipmentI18n(); return <div className="sh-header"><div><p className="sh-breadcrumb">{t('Shipments')}{shipment?.supplier ? ` / ${shipment.supplier}` : ''}</p><h1>{shipment?.name || t('Shipments')}</h1></div><div className="sh-actions">{shipment && <><button className="sh-button" onClick={() => onAction('export')}>{t('Export to Excel')}</button>{canWrite && <button className="sh-button" disabled={busy} onClick={() => onAction('duplicate')}>{t('Duplicate')}</button>}</>}{canWrite && <button className="sh-button" disabled={busy} onClick={() => onAction('new')}>＋ {t('New shipment')}</button>}{shipment && canWrite && <><button className="sh-button" disabled={busy || !editable(shipment)} onClick={() => onAction('settings')}>{t('Shipment settings')}</button>{dirty && <button className="sh-button sh-primary" disabled={busy} onClick={() => onAction('save')}>{t(busy ? 'Saving…' : 'Save changes')}</button>}{shipment.stage === 'proposed' && <button className="sh-button sh-primary" disabled={busy || !shipment.version} onClick={() => onAction('confirm')}>{t('Confirm order and save forecast')}</button>}</>}</div></div>; }
export function ShipmentSelector({ shipments, shipment, view, onView, onSelect }: {
    shipments: Shipment[];
    shipment: Shipment | null;
    view: 'active' | 'completed';
    onView: (v: 'active' | 'completed') => void;
    onSelect: (id: string) => void;
}) { const { t, number } = useShipmentI18n(); const list = shipments.filter(s => completed(s) === (view === 'completed')); return <div className="sh-selector"><div className="sh-segments">{(['active', 'completed'] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => onView(v)}>{t(v === 'active' ? 'Active' : 'Completed')} <span>{shipments.filter(s => completed(s) === (v === 'completed')).length}</span></button>)}</div><div className="sh-select-line"><select aria-label={t('Select shipment')} value={shipment?.version ? shipment.id : ''} onChange={e => onSelect(e.target.value)}><option value="">{t('Select shipment')}</option>{list.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select>{shipment && <><span>{shipment.currency || '—'} / THB {number(shipment.fx, 4)}</span><span>{number(shipment.wines.reduce((n, w) => n + w.qty, 0), 0)} {t('Bottles')} · {shipment.pallets.length} {t('Pallets')}</span></>}</div></div>; }
export function ShipmentLifecycle({ shipment, onAction, disabled }: {
    shipment: Shipment;
    onAction: (a: string) => void;
    disabled: boolean;
}) { const { t, date } = useShipmentI18n(); const index = ['proposed', 'ordered', 'actuals', 'closed'].indexOf(shipment.stage); return <section className="sh-lifecycle" aria-label={t('Order lifecycle')}><span className="sh-label">{t('Order lifecycle')}</span><ol>{['Plan pallet', 'Order placed', 'Record actuals', 'Compared'].map((label, i) => <li key={label} className={i === index ? 'current' : i < index ? 'done' : ''} aria-current={i === index ? 'step' : undefined}><b>{i + 1}</b>{t(label)}</li>)}</ol><div className="sh-stage-actions">{shipment.arrivalDate ? <span>{t('Landed')}: {date(shipment.arrivalDate)}</span> : shipment.forecastId && <button className="sh-text-button" disabled={disabled} onClick={() => onAction('land')}>{t('Mark as landed')}</button>}{shipment.stage === 'ordered' && <><button className="sh-text-button" disabled={disabled} onClick={() => onAction('revise')}>{t('Revise forecast')}</button><button className="sh-text-button" disabled={disabled} onClick={() => onAction('actuals')}>{t('Open actual costs')}</button></>}{shipment.stage === 'closed' && <button className="sh-text-button" disabled={disabled} onClick={() => onAction('actuals')}>{t('Open actual costs')}</button>}</div></section>; }
