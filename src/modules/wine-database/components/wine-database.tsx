"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { localeFor, type TranslationKey } from "@/lib/i18n/dictionaries";
import { Modal } from "./modal";
import { WineCatalogue } from "./wine-catalogue";
import { WineDetails } from "./wine-details";
import { WineForm } from "./wine-form";
import { useLocalWineChanges } from "../lib/local-store";
import { filterWines } from "../lib/catalogue";
import { downloadJson, readBackup, reconcileWine } from "../lib/reconciliation";
import { errorMessage, wineRequest } from "../lib/api";
import type { Wine } from "../types";
type Panel =
  | { kind: "details" | "edit" | "delete"; wine: Wine }
  | { kind: "add" }
  | { kind: "reconcile" }
  | { kind: "local"; wine: Wine; remote?: Wine }
  | null;
const endpoint = "/api/wine-database";
export function WineDatabase() {
  const { t, language, number } = useI18n();
  const localRaw = useLocalWineChanges();
  const [backupRaw, setBackupRaw] = useState<string | null>(null);
  const raw = backupRaw ?? localRaw;
  const backup = useMemo(() => {
    try {
      return { changes: raw ? readBackup(raw) : null, error: false };
    } catch {
      return { changes: null, error: true };
    }
  }, [raw]);
  const [wines, setWines] = useState<Wine[]>([]),
    [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(""),
    [producer, setProducer] = useState(""),
    [country, setCountry] = useState(""),
    [style, setStyle] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false),
    [sort, setSort] = useState("producer");
  const [panel, setPanel] = useState<Panel>(null),
    [message, setMessage] = useState<TranslationKey | "">("");
  const [writeError, setWriteError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setCanWrite(false);
    try {
      const result = await wineRequest<{ wines: Wine[]; canWrite: boolean }>(
        endpoint,
      );
      setWines(result.wines);
      setCanWrite(result.canWrite);
    } catch (error) {
      setWines([]);
      setLoadError(error instanceof Error ? error.message : "unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    wineRequest<{ wines: Wine[]; canWrite: boolean }>(endpoint)
      .then((result) => {
        if (active) {
          setWines(result.wines);
          setCanWrite(result.canWrite);
        }
      })
      .catch((error) => {
        if (active) {
          setWines([]);
          setLoadError(error instanceof Error ? error.message : "unavailable");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const producers = [...new Set(wines.map((wine) => wine.producer))].sort();
  const countries = [
    ...new Set(wines.map((wine) => wine.country).filter(Boolean)),
  ].sort();
  const filtered = useMemo(
    () =>
      filterWines(
        wines,
        { query, producer, country, style, reviewOnly, sort },
        localeFor(language),
      ),
    [wines, query, producer, country, style, reviewOnly, sort, language],
  );
  const hasFilters = !!(query || producer || country || style || reviewOnly);
  const errorText = (
    code: string,
    fallback: TranslationKey = "Save could not be confirmed. Refresh before retrying.",
  ) => t(errorMessage[code] ?? fallback);
  function clearFilters() {
    setQuery("");
    setProducer("");
    setCountry("");
    setStyle("");
    setReviewOnly(false);
  }
  function close() {
    if (!busy) {
      setPanel(null);
      setWriteError("");
    }
  }
  async function save(wine: Wine): Promise<string | null> {
    setBusy(true);
    try {
      const existing =
        panel?.kind === "edit" || (panel?.kind === "local" && !!panel.remote);
      const saved = await wineRequest<Wine>(
        existing ? `${endpoint}/${encodeURIComponent(wine.id)}` : endpoint,
        existing ? "PUT" : "POST",
        { ...wine, shipmentCosts: undefined },
      );
      setWines((previous) => [
        ...previous.filter((record) => record.id !== saved.id),
        { ...saved, shipmentCosts: previous.find(record => record.id === saved.id)?.shipmentCosts },
      ]);
      setPanel(null);
      setMessage("Saved to shared database.");
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "write";
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (panel?.kind !== "delete") return;
    setBusy(true);
    setWriteError("");
    try {
      await wineRequest(
        `${endpoint}/${encodeURIComponent(panel.wine.id)}`,
        "DELETE",
        { version: panel.wine.version },
      );
      setWines((previous) =>
        previous.filter((wine) => wine.id !== panel.wine.id),
      );
      setPanel(null);
      setMessage("Wine archived.");
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : "write");
    } finally {
      setBusy(false);
    }
  }
  function exportDatabase() {
    downloadJson(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        wines,
        legacyRaw: localRaw,
      },
      `gs-hub-wine-database-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }
  function exportLocal() {
    downloadJson(
      { version: 1, exportedAt: new Date().toISOString(), legacyRaw: raw },
      "gs-hub-local-wine-backup.json",
    );
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10_000_000) throw new Error("size");
      const text = await file.text();
      readBackup(text);
      setBackupRaw(text);
      setMessage("Import prepared. Review each record.");
      setPanel({ kind: "reconcile" });
    } catch {
      setMessage("Backup file is invalid.");
    }
  }
  return (
    <main id="main-content" className="workspace-main library-main">
      <div className="page-heading library-heading">
        <h1>{t("Wine database")}</h1>
        <div className="heading-actions">
          <button
            className="button refresh-button"
            aria-label={t("Refresh")}
            title={t("Refresh")}
            onClick={load}
            disabled={loading}
          >
            ↻
          </button>
          <button
            className="button"
            aria-label={t("Export database")}
            title={t("Export database")}
            disabled={loading || !!loadError}
            onClick={exportDatabase}
          >
            <span aria-hidden="true">↓</span>
            <span className="export-label">{t("Export database")}</span>
          </button>
          <button
            className="button button-primary"
            disabled={!canWrite || loading}
            onClick={() => {
              setMessage("");
              setPanel({ kind: "add" });
            }}
          >
            + {t("Add wine")}
          </button>
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          {t(message)}
        </p>
      )}

      {loading ? (
        <p role="status" className="notice">
          {t("Loading wines…")}
        </p>
      ) : loadError ? (
        <section className="notice error" role="alert">
          <h2>
            {t(loadError === "auth" ? "Sign in" : "Access setup required")}
          </h2>
          <p>
            {errorText(
              loadError,
              "Database unavailable. No cached records are shown. Retry after checking Supabase setup.",
            )}
          </p>
          {loadError === "auth" ? (
            <Link className="button button-primary" href="/sign-in">
              {t("Sign in")}
            </Link>
          ) : (
            <button className="button" onClick={load}>
              {t("Retry")}
            </button>
          )}
        </section>
      ) : (
        <section className="library-panel" aria-label={t("Wine database")}>
          <div className="library-toolbar">
            <label className="search-field">
              <span className="sr-only">{t("Search wines")}</span>
              <input
                aria-label={t("Search wines")}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search wine, producer, vintage or SKU…")}
              />
            </label>
            <label className="filter-select">
              <span className="sr-only">{t("Producer")}</span>
              <select
                aria-label={t("Producer")}
                value={producer}
                onChange={(event) => setProducer(event.target.value)}
              >
                <option value="">{t("All producers")}</option>
                {producers.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span className="sr-only">{t("Wine style")}</span>
              <select
                aria-label={t("Wine style")}
                value={style}
                onChange={(event) => setStyle(event.target.value)}
              >
                <option value="">{t("All styles")}</option>
                {(["Red", "White", "Rosé", "Sparkling", "Other"] as const).map(
                  (name) => (
                    <option key={name} value={name}>
                      {t(name)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="filter-select country-filter">
              <span className="sr-only">{t("Country")}</span>
              <select
                aria-label={t("Country")}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="">{t("All countries")}</option>
                {countries.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="results-toolbar">
            <p role="status">
              {t("Matching wines")}: {number(filtered.length, 0)}{" "}
              {hasFilters && (
                <button className="text-button" onClick={clearFilters}>
                  {t("Clear filters")} ×
                </button>
              )}
            </p>
            <div className="result-controls">
              <label className="review-filter">
                <input
                  type="checkbox"
                  checked={reviewOnly}
                  onChange={(event) => setReviewOnly(event.target.checked)}
                />
                {t("Missing registered price")}
              </label>
              {!canWrite && (
                <span className="device-label">{t("Read-only access")}</span>
              )}
              <label>
                {t("Sort by")}{" "}
                <select
                  aria-label={t("Sort wines")}
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  {(
                    [
                      ["producer", "Producer"],
                      ["name", "Wine name"],
                      ["price-low", "Price: low to high"],
                      ["price-high", "Price: high to low"],
                    ] as const
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {filtered.length ? (
            <WineCatalogue
              wines={filtered}
              onSelect={(wine) => {
                setMessage("");
                setPanel({ kind: "details", wine });
              }}
            />
          ) : (
            <div className="empty-state">
              <h2>{t(hasFilters ? "No wines found" : "No wines yet")}</h2>
              <p>
                {t(
                  hasFilters
                    ? "Try a different search or clear your filters."
                    : "Add a wine to begin.",
                )}
              </p>
              {hasFilters && (
                <button className="button" onClick={clearFilters}>
                  {t("Clear filters")}
                </button>
              )}
            </div>
          )}
        </section>
      )}
      <footer className="library-footnote">
        <p>
          {t(
            "Prices per bottle. THB prices exclude VAT. Cost references retain their original basis.",
          )}
        </p>
        <p>{t("Source data is shown in its original language.")}</p>
      </footer>
      <details className="local-recovery">
        <summary>
          {t("Local reconciliation")}
          {raw ? " •" : ""}
        </summary>
        <p>
          {t(
            "Local changes are preserved and are not applied automatically. Export a backup and review each record before importing.",
          )}
        </p>
        {backup.error && (
          <p role="alert">
            {t(
              "Local backup could not be read. Export the original value for recovery.",
            )}
          </p>
        )}
        <div className="recovery-actions">
          <button className="button" onClick={exportLocal} disabled={!raw}>
            {t("Export local backup")}
          </button>
          <button
            className="button"
            disabled={!backup.changes || !canWrite || loading}
            onClick={() => setPanel({ kind: "reconcile" })}
          >
            {t("Review local changes")}
          </button>
          <label className="button">
            {t("Import backup file")}
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </details>
      {panel?.kind === "details" && (
        <WineDetails
          key={panel.wine.id}
          wine={panel.wine}
          onClose={close}
          editable={canWrite && !loading && !loadError}
          onEdit={() => setPanel({ kind: "edit", wine: panel.wine })}
          onDelete={() => setPanel({ kind: "delete", wine: panel.wine })}
        />
      )}
      {(panel?.kind === "edit" ||
        panel?.kind === "add" ||
        panel?.kind === "local") && (
        <WineForm
          key={panel.kind === "add" ? "new" : `${panel.kind}-${panel.wine.id}`}
          wine={
            panel.kind === "add"
              ? null
              : panel.kind === "local"
                ? reconcileWine(panel.wine, panel.remote)
                : panel.wine
          }
          onSave={save}
          onClose={close}
        />
      )}
      {panel?.kind === "delete" && (
        <Modal
          title={t("Archive this wine?")}
          subtitle={`${panel.wine.producer} · ${panel.wine.name}`}
          onClose={close}
        >
          <div className="modal-body">
            <p>
              {t(
                "This hides the wine for all team members. Historical evidence is retained.",
              )}
            </p>
            {writeError && (
              <p className="notice error" role="alert">
                {errorText(writeError)}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="button" disabled={busy} onClick={close}>
              {t("Keep wine")}
            </button>
            <button
              className="button button-danger"
              disabled={busy}
              onClick={remove}
            >
              {t(busy ? "Working…" : "Archive wine")}
            </button>
          </div>
        </Modal>
      )}
      {panel?.kind === "reconcile" && (
        <Modal title={t("Local reconciliation")} onClose={close} wide>
          <div className="modal-body">
            <p>
              {t(
                "Review current and local values. Saving uses the displayed remote version.",
              )}
            </p>
            {!backup.changes && <p>{t("No local changes found.")}</p>}
            {backup.changes?.saved
              .filter((wine) => !backup.changes?.deleted.includes(wine.id))
              .map((local) => {
                const remote = wines.find((wine) => wine.id === local.id);
                return (
                  <details className="reconciliation-record" key={local.id}>
                    <summary>
                      {local.producer} · {local.name} ({local.id})
                    </summary>
                    <div className="comparison">
                      <div>
                        <h3>{t("Local record")}</h3>
                        <pre>{JSON.stringify(local, null, 2)}</pre>
                      </div>
                      <div>
                        <h3>{t("Remote record")}</h3>
                        <pre>
                          {remote
                            ? JSON.stringify(remote, null, 2)
                            : t("New record")}
                        </pre>
                      </div>
                    </div>
                    <button
                      className="button"
                      disabled={!canWrite || loading}
                      onClick={() =>
                        setPanel({ kind: "local", wine: local, remote })
                      }
                    >
                      {t("Review local record")}
                    </button>
                  </details>
                );
              })}
            <h3>{t("Local deletions")}</h3>
            {backup.changes?.deleted.map((id) => {
              const remote = wines.find((wine) => wine.id === id);
              return (
                <div className="reconciliation-record" key={id}>
                  <p>{remote?.name ?? id}</p>
                  <p>
                    {remote
                      ? `${t("Archive remote wine using the displayed version.")} (${remote.version})`
                      : t(
                          "Remote record missing or archived; nothing was changed.",
                        )}
                  </p>
                  <button
                    className="button"
                    disabled={!remote || !canWrite || loading}
                    onClick={() =>
                      remote && setPanel({ kind: "delete", wine: remote })
                    }
                  >
                    {t("Apply local deletion")}
                  </button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </main>
  );
}
