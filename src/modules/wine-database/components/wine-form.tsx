"use client";

import { useId, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { errorMessage } from "../lib/api";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Modal } from "./modal";
import type { Wine } from "../types";
import { cost, isWine } from "../lib/model";

export function WineForm({
  wine,
  onSave,
  onClose,
}: {
  wine: Wine | null;
  onSave: (wine: Wine) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t, baht } = useI18n();
  const [busy, setBusy] = useState(false);
  const id = useId();
  const [error, setError] = useState("");
  const [sales, setSales] = useState(wine?.sellingPrice?.toString() ?? "");
  const fields = [
    ["name", "Wine name", "text", wine?.name ?? "", true],
    ["producer", "Producer", "text", wine?.producer ?? "", true],
    ["vintage", "Vintage", "text", wine?.vintage ?? "", false],
    ["variety", "Variety / blend", "text", wine?.variety ?? "", false],
    ["country", "Country", "text", wine?.country ?? "", false],
    ["sku", "SKU", "text", wine?.sku ?? "", false],
    ["abv", "ABV (%)", "number", wine?.abv ?? "", false],
    ["ml", "Bottle size (ml)", "number", wine?.ml ?? "", false],
    ["caseSize", "Bottles per case", "number", wine?.caseSize ?? "", false],
    [
      "sourceCost",
      "Supplier cost / bottle",
      "number",
      wine?.sourceCost ?? "",
      false,
    ],
    ["rrp", "RRP (THB)", "number", wine?.rrp ?? "", false],
    [
      "recommendationCost",
      "Recommendation cost (THB)",
      "number",
      wine?.recommendationCost ?? "",
      false,
    ],
    [
      "discount",
      "Supplier discount (%)",
      "number",
      wine?.discount ?? "",
      false,
    ],
    [
      "registeredPrice",
      "Registered price (THB)",
      "number",
      wine?.registeredPrice ?? "",
      false,
    ],
  ] as const;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const values = new FormData(event.currentTarget);
    const text = (key: string) => String(values.get(key) ?? "").trim();
    const numeric = (key: string) =>
      text(key) === "" ? null : Number(text(key));
    const next: Wine = {
      ...wine,
      id: wine?.id ?? crypto.randomUUID(),
      name: text("name"),
      producer: text("producer"),
      vintage: text("vintage"),
      variety: text("variety"),
      wineType: text("wineType"),
      country: text("country"),
      sku: text("sku"),
      abv: numeric("abv"),
      ml: numeric("ml"),
      caseSize: numeric("caseSize"),
      sourceCost: numeric("sourceCost"),
      currency: text("currency"),
      discount: numeric("discount"),
      registeredPrice: numeric("registeredPrice"),
      registeredPriceSource:
        wine && wine.registeredPrice === numeric("registeredPrice")
          ? wine.registeredPriceSource
          : numeric("registeredPrice") == null
            ? "Needs review"
            : "Confirmed manual entry",
      sellingPrice: numeric("sellingPrice"),
      rrp: numeric("rrp"),
      recommendationCost: numeric("recommendationCost"),
      landedReference: wine?.landedReference ?? null,
      importedCost: wine?.importedCost ?? null,
      historicalCost: wine?.historicalCost ?? null,
      imageUrl: wine?.imageUrl ?? null,
      sourceNote: wine?.sourceNote ?? "Manually created in GS Hub.",
    };
    if (!next.name || !next.producer) {
      setError("Wine name and producer are required.");
      return;
    }
    if (!event.currentTarget.checkValidity() || !isWine(next)) {
      setError(
        "Check the wine details. Numeric values must be valid and non-negative.",
      );
      return;
    }
    setBusy(true);
    try {
      const message = await onSave(next);
      if (message)
        setError(
          errorMessage[message] ??
            "Save could not be confirmed. Refresh before retrying.",
        );
    } catch {
      setError("Save could not be confirmed. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t(wine ? "Edit wine" : "Add a wine")}
      subtitle={t("Changes are saved to the shared database.")}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <div className="modal-body">
          <div className="form-grid">
            {fields.map(([name, label, type, value, required]) => (
              <label className="field" key={name} htmlFor={`${id}-${name}`}>
                {t(label)}
                {required ? " *" : ""}
                <input
                  id={`${id}-${name}`}
                  name={name}
                  type={type}
                  defaultValue={value}
                  required={required}
                  maxLength={type === "text" ? 160 : undefined}
                  min={
                    type === "number"
                      ? ["ml", "caseSize"].includes(name)
                        ? 1
                        : 0
                      : undefined
                  }
                  max={name === "abv" || name === "discount" ? 100 : undefined}
                  step={
                    type === "number"
                      ? ["caseSize", "ml"].includes(name)
                        ? "1"
                        : "any"
                      : undefined
                  }
                />
              </label>
            ))}
            <label className="field" htmlFor={`${id}-type`}>
              {t("Wine style")}
              <select
                id={`${id}-type`}
                name="wineType"
                defaultValue={wine?.wineType ?? ""}
              >
                <option value="">{t("Not recorded")}</option>
                {[
                  ...new Set([
                    "Red",
                    "White",
                    "Rose",
                    "Sparkling",
                    "Other",
                    ...(wine?.wineType ? [wine.wineType] : []),
                  ]),
                ].map((style) => (
                  <option key={style} value={style}>
                    {["Red", "White", "Rose", "Sparkling", "Other"].includes(
                      style,
                    )
                      ? t(style as "Red")
                      : style}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor={`${id}-currency`}>
              {t("Supplier currency")}
              <select
                id={`${id}-currency`}
                name="currency"
                defaultValue={wine?.currency ?? ""}
              >
                <option value="">{t("Not recorded")}</option>
                {[
                  ...new Set([
                    "USD",
                    "EUR",
                    "AUD",
                    "NZD",
                    "ZAR",
                    "GBP",
                    "THB",
                    ...(wine?.currency ? [wine.currency] : []),
                  ]),
                ].map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <label className="field full-field" htmlFor={`${id}-sales`}>
              {t("Sales price (THB, excluding VAT)")}
              <input
                id={`${id}-sales`}
                name="sellingPrice"
                type="number"
                min="0"
                step="any"
                value={sales}
                onChange={(event) => setSales(event.target.value)}
              />
            </label>
          </div>
          {wine && (
            <p className="notice">
              {t("Imported cost reference")}: {baht(cost(wine))}.{" "}
              {t("Current edits do not change historical evidence.")}
            </p>
          )}
          <p className="form-help">
            {t(
              "Registered price is the tax input. Sales price is the commercial price. Leave unknown values blank.",
            )}
          </p>
          {error && (
            <p className="notice error" role="alert">
              {t(error as TranslationKey)}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t("Cancel")}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            {t(busy ? "Saving…" : wine ? "Save changes" : "Add wine")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
