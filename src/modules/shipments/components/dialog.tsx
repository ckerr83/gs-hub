'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useShipmentI18n } from '../i18n';
export function Dialog({ title, children, onClose }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
}) { const ref = useRef<HTMLDialogElement>(null), id = useId(), { t } = useShipmentI18n(); useEffect(() => { ref.current?.showModal(); }, []); return <dialog className="shipment-dialog" ref={ref} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}><div className="sh-dialog-heading"><h2 id={id}>{title}</h2><button type="button" className="sh-button" onClick={onClose} aria-label={t('Close')}>×</button></div>{children}</dialog>; }
export function Field({ label, value, onChange, type = 'text', required = false, min, step = 'any', name }: {
    label: string;
    name?: string;
    value: string | number | null;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
    min?: number;
    step?: string;
}) { return <label className="sh-field"><span>{label}</span><input name={name} type={type} value={value ?? ''} required={required} min={min} step={step} onChange={e => onChange(e.target.value)}/></label>; }
export const numeric = (value: string) => value.trim() === '' ? null : Number(value);
