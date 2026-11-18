"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog && !dialog.open) dialog.showModal();
    // Removing the dialog closes it. Calling close() in cleanup would also fire
    // onClose during React Strict Mode's development effect replay.
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">{t("Wine database")}</p>
          <h2 id={id}>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Close dialog")}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
