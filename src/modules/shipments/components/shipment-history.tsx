'use client';
import type { Shipment, Snapshot } from '../types';
import { useShipmentI18n } from '../i18n';
export function ShipmentHistory({ shipment, disabled, onVersion, onNote }: {
    shipment: Shipment;
    disabled: boolean;
    onVersion: (v: Snapshot) => void;
    onNote: () => void;
}) { const { t, date } = useShipmentI18n(); return <div className="sh-history"><section className="sh-panel"><div className="sh-panel-heading"><h2>{t('Saved versions')}</h2></div><dl className="sh-dates">{[['Order date', shipment.orderDate], ['Expected arrival', shipment.expectedDate], ['Arrival date', shipment.arrivalDate]].map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value ? date(value) : '—'}</dd></div>)}</dl>{[...shipment.snapshots].reverse().map(v => <div className="sh-version" key={v.id}><div><strong>{v.name}</strong><small>{t(v.kind)} · {date(v.created)}</small>{v.note && <p>{v.note}</p>}</div><button className="sh-button" onClick={() => onVersion(v)}>{t('View version')}</button></div>)}{!shipment.snapshots.length && <p className="sh-empty">{t('No saved versions.')}</p>}</section><section className="sh-panel"><div className="sh-panel-heading"><h2>{t('Notes')}</h2><button className="sh-button" disabled={disabled || !shipment.version} onClick={onNote}>＋ {t('Add note')}</button></div>{[...shipment.notes].reverse().map(n => <article className="sh-note" key={n.id}><p>{n.text}</p><small>{n.author} · {date(n.created)}</small></article>)}{!shipment.notes.length && <p className="sh-empty">{t('No notes.')}</p>}</section></div>; }
