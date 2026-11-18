"use client";
import { BottleImage } from "./bottle-image";
import { cost, metrics, wineStyle } from "../lib/model";
import { useI18n } from "@/lib/i18n/provider";
import type { Wine } from "../types";
export function WineCatalogue({
  wines,
  onSelect,
}: {
  wines: Wine[];
  onSelect: (wine: Wine) => void;
}) {
  const { t, number, baht } = useI18n();
  return (
    <>
      <p className="table-scroll-hint">
        ↔ {t("Scroll horizontally for more columns")}
      </p>
      <div
        className="wine-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("Wine table, scroll horizontally for more columns")}
      >
        <table className="wine-table">
          <caption className="sr-only">
            {t(
              "Prices per bottle. THB prices exclude VAT. Cost references retain their original basis.",
            )}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("Wine / producer")}</th>
              <th scope="col">{t("Vintage / style")}</th>
              {(
                [
                  "ABV / size",
                  "Supplier / bottle",
                  "Landed reference",
                  "Registered price",
                  "Sales price",
                  "Margin",
                  "Markup",
                  "Profit / bottle",
                ] as const
              ).map((label) => (
                <th scope="col" className="numeric" key={label}>
                  {t(label)}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">{t("Actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {wines.map((wine) => {
              const { margin, markup, profit } = metrics(wine);
              return (
                <tr key={wine.id}>
                  <td>
                    <button
                      className="wine-name-button"
                      onClick={() => onSelect(wine)}
                    >
                      <BottleImage
                        key={`${wine.id}-${wine.imageUrl}`}
                        wine={wine}
                      />
                      <span>
                        <strong>{wine.name}</strong>
                        <small>
                          {wine.producer} · {wine.country || t("Not recorded")}
                        </small>
                        <small>{wine.sku || "—"}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span
                      className={`style-tag style-${wineStyle(wine).toLowerCase()}`}
                    >
                      {t(wineStyle(wine))}
                    </span>
                    <small>{wine.vintage || t("Not recorded")}</small>
                  </td>
                  <td className="numeric">
                    {wine.abv == null ? "—" : `${number(wine.abv, 1)}%`}
                    <small>
                      {wine.ml == null ? "—" : `${number(wine.ml, 0)} ml`}
                    </small>
                  </td>
                  <td className="numeric">
                    {wine.currency || "—"} {number(wine.sourceCost)}
                    <small>
                      {number(wine.discount, 1)}% {t("discount")}
                    </small>
                  </td>
                  <td className="numeric">
                    {baht(cost(wine))}
                    <small>
                      {wine.importedCost?.basis || t("No cost basis")}
                    </small>
                  </td>
                  <td className="numeric">
                    {wine.registeredPrice == null ? (
                      <span className="review-tag">{t("Needs review")}</span>
                    ) : (
                      baht(wine.registeredPrice)
                    )}
                  </td>
                  <td className="numeric sales-price">
                    {baht(wine.sellingPrice)}
                  </td>
                  <td className="numeric">
                    {margin == null ? "—" : `${number(margin, 1)}%`}
                  </td>
                  <td className="numeric">
                    {markup == null ? "—" : `${number(markup, 1)}%`}
                  </td>
                  <td className="numeric">{baht(profit)}</td>
                  <td>
                    <button
                      className="details-button"
                      onClick={() => onSelect(wine)}
                      aria-label={`${t("Details")}: ${wine.name}`}
                    >
                      {t("Details")} ↗
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
