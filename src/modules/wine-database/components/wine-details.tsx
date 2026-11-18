"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Modal } from "./modal";
import { BottleImage } from "./bottle-image";
import { cost, metrics, wineStyle } from "../lib/model";
import type { JsonValue, Wine, WineEvidence } from "../types";

function EvidenceValue({ value }: { value: JsonValue }) {
  const { t } = useI18n();
  if (value === null) return <span className="muted">{t("Not recorded")}</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  if (Array.isArray(value))
    return (
      <div className="evidence-list">
        {value.map((item, i) => (
          <div key={i}>
            <EvidenceValue value={item} />
          </div>
        ))}
      </div>
    );
  return (
    <dl className="evidence-values">
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
          <dd>
            <EvidenceValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function WineDetails({
  wine,
  onClose,
  onEdit,
  onDelete,
  editable,
}: {
  wine: Wine;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editable: boolean;
}) {
  const { t, baht, number, date } = useI18n();
  const [evidence, setEvidence] = useState<WineEvidence | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const { margin, markup, profit } = metrics(wine);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/wine-database/${encodeURIComponent(wine.id)}`, {
      signal: abort.signal,
    })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("evidence");
        return response.json() as Promise<WineEvidence>;
      })
      .then((result) => {
        setEvidence(result);
        setLoading(false);
        setEvidenceError("");
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
          setEvidenceError("The source evidence could not be loaded.");
        }
      });
    return () => abort.abort();
  }, [wine.id, attempt]);
  const facts = [
    [t("Updated"), wine.updatedAt ? date(wine.updatedAt) : t("Not recorded")],
    [t("Producer"), wine.producer],
    [t("Country"), wine.country || t("Not recorded")],
    [t("Vintage"), wine.vintage || t("Not recorded")],
    [t("Variety / blend"), wine.variety || t("Not recorded")],
    [
      t("ABV"),
      wine.abv == null ? t("Not recorded") : `${number(wine.abv, 1)}%`,
    ],
    [
      t("Bottle size"),
      wine.ml == null ? t("Not recorded") : `${number(wine.ml, 0)} ml`,
    ],
    [
      t("Bottles per case"),
      wine.caseSize ? number(wine.caseSize, 0) : t("Not recorded"),
    ],
    [t("SKU"), wine.sku || t("Not recorded")],
  ];
  const prices = [
    [t("Legacy landed reference"), baht(wine.landedReference)],
    [t("RRP (THB)"), baht(wine.rrp)],
    [t("Recommendation cost (THB)"), baht(wine.recommendationCost)],
    [
      t("Registered price source"),
      wine.registeredPriceSource || t("Not recorded"),
    ],
    [
      t("Supplier cost / bottle"),
      `${wine.currency} ${number(wine.sourceCost, 4)}`,
    ],
    [t("Supplier discount"), `${number(wine.discount, 1)}%`],
    [
      t("Net supplier cost"),
      `${wine.currency} ${number(wine.sourceCost == null || wine.discount == null ? null : wine.sourceCost * (1 - wine.discount / 100), 4)}`,
    ],
    [
      t("Registered price"),
      wine.registeredPrice == null
        ? t("Needs review")
        : baht(wine.registeredPrice),
    ],
    [t("Sales price"), baht(wine.sellingPrice)],
    [t("Markup"), markup == null ? "—" : `${number(markup, 1)}%`],
  ];
  return (
    <Modal
      title={wine.name}
      subtitle={`${wine.producer} · ${wine.vintage || t("Not recorded")}`}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="wine-detail-top">
          <div className="detail-photo">
            <BottleImage key={wine.imageUrl} wine={wine} large />
          </div>
          <div className="detail-overview">
            <span
              className={`style-tag style-${wineStyle(wine).toLowerCase()}`}
            >
              {t(wineStyle(wine))}
            </span>
            <p className="detail-origin">
              {wine.country || t("Not recorded")} <span>·</span>{" "}
              {wine.sku || t("Not recorded")}
            </p>
            <div className="detail-metrics">
              <div>
                <span>{t("Landed reference")}</span>
                <strong>{baht(cost(wine))}</strong>
                <small>
                  {wine.importedCost?.basis === "Projected"
                    ? wine.importedCost.basis
                    : wine.importedCost?.basis || t("No cost basis")}
                </small>
              </div>
              <div>
                <span>{t("Sales price")}</span>
                <strong>{baht(wine.sellingPrice)}</strong>
                <small>{t("THB / bottle, excl. VAT")}</small>
              </div>
              <div>
                <span>{t("Gross margin")}</span>
                <strong>
                  {margin == null ? "—" : `${number(margin, 1)}%`}
                </strong>
                <small>{t("Profit \u00f7 sales price")}</small>
              </div>
              <div>
                <span>{t("Profit / bottle")}</span>
                <strong>{baht(profit)}</strong>
                <small>{t("Sales \u2212 landed reference")}</small>
              </div>
            </div>
          </div>
        </div>
        <div className="detail-columns">
          <section className="detail-section">
            <h3>{t("Wine details")}</h3>
            <dl className="fact-list">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="detail-section">
            <h3>{t("Supplier & pricing")}</h3>
            <dl className="fact-list">
              {prices.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <section className="detail-section cost-notes">
          <h3>{t("Cost reference & source evidence")}</h3>
          <p>
            {wine.importedCost?.detail ||
              wine.sourceNote ||
              t("No imported cost reference is available for this wine.")}
          </p>
          <p className="form-help">
            {t(
              "Imported projections are frozen. Workbook figures are unverified. Current edits do not change historical evidence. Prices and profit exclude VAT.",
            )}
          </p>
          {wine.historicalCost && (
            <p className="form-help">
              {t("Historical reference")}: {baht(wine.historicalCost.cost)} ·{" "}
              {wine.historicalCost.basis} · {wine.historicalCost.detail}
            </p>
          )}
          {loading && (
            <p className="muted" role="status">
              {t("Loading source evidence\u2026")}
            </p>
          )}
          {evidenceError && (
            <p role="alert">
              {t("The source evidence could not be loaded.")}{" "}
              <button
                className="text-button"
                onClick={() => {
                  setLoading(true);
                  setAttempt((value) => value + 1);
                }}
              >
                {t("Retry")}
              </button>
            </p>
          )}
          {evidence?.savedBreakdown && (
            <details className="source-evidence">
              <summary>{t("Saved shipment calculation")}</summary>
              <EvidenceValue value={evidence.savedBreakdown} />
            </details>
          )}
          {evidence?.workbookRows.map((row, index) => (
            <details className="source-evidence" key={index}>
              <summary>
                {t("Original workbook evidence · row")}
                {typeof row === "object" && row !== null && !Array.isArray(row)
                  ? String(row.row ?? index + 1)
                  : index + 1}{" "}
                · {t("unverified")}
              </summary>
              <EvidenceValue value={row} />
            </details>
          ))}
          {!loading &&
            !evidenceError &&
            !evidence?.savedBreakdown &&
            !evidence?.workbookRows.length && (
              <p className="muted">
                {t(
                  "No underlying workbook or saved shipment calculation is available.",
                )}
              </p>
            )}
        </section>
      </div>
      <div className="modal-footer">
        <button
          className="button danger-button"
          onClick={onDelete}
          disabled={!editable}
        >
          {t("Archive wine")}
        </button>
        <button className="button" onClick={onClose}>
          {t("Close")}
        </button>
        <button
          className="button button-primary"
          onClick={onEdit}
          disabled={!editable}
        >
          {t("Edit wine")}
        </button>
      </div>
    </Modal>
  );
}
