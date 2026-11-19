"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import type { Wine } from "../types";
import { costBasis } from "../lib/model";
import type { WineShipmentCost } from "@/modules/shipments/data/wine-costs";

function sourceUrl(entry: WineShipmentCost) {
  const query = new URLSearchParams({ shipment: entry.shipmentId });
  if (entry.versionId) query.set("version", entry.versionId);
  return `/shipments?${query}`;
}
export function WineShipmentHistory({ wine }: { wine: Wine }) {
  const { t, baht, number, date } = useI18n();
  const costs = wine.shipmentCosts;
  const current = costs?.actual ?? costs?.calculated;
  return <section className="detail-section shipment-cost-history">
    <h3>{t("Shipment cost history")}</h3>
    {current ? <p>
      {t("Displayed basis")}: <strong>{t(costBasis(wine))}</strong> ·{" "}
      <Link href={sourceUrl(current)}>{current.shipmentName}</Link>
      {current.date && <> · {date(current.date)}</>}
      {current.cost === null && <> · {t("Incomplete cost inputs")}</>}
    </p> : <p>{t("No linked shipment cost. The imported reference is shown when available.")}</p>}
    <p className="form-help">{t("THB per bottle, excluding VAT. Latest recorded actuals supersede calculated costs. Partial actuals may include estimates.")}</p>
    {!!costs?.history.length && <div className="shipment-history-scroll" role="region" tabIndex={0} aria-label={t("Shipment cost history")}>
      <table className="shipment-history-table">
        <thead><tr><th>{t("Shipment / version")}</th><th>{t("Date")}</th><th>{t("Cost basis")}</th><th className="numeric">{t("Bottles")}</th><th className="numeric">{t("Landed cost")}</th></tr></thead>
        <tbody>{costs.history.map(entry => <tr key={`${entry.shipmentId}:${entry.versionId ?? "draft"}`}>
          <td><Link href={sourceUrl(entry)}>{entry.shipmentName}</Link><small>{entry.versionName || t("Saved plan")}</small></td>
          <td>{entry.date ? date(entry.date) : "—"}</td>
          <td>{t(entry.kind === "calculated" ? "Calculated" : entry.status === "complete" ? "Actual" : "Actual · partial")}</td>
          <td className="numeric">{number(entry.bottles, 0)}</td>
          <td className="numeric">{baht(entry.cost)}{entry.cost === null && <small>{t("Incomplete cost inputs")}</small>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
