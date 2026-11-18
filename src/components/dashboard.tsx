"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
export function Dashboard() {
  const { t } = useI18n();
  return (
    <main id="main-content" className="workspace-main">
      <div className="page-heading">
        <h1>{t("Dashboard")}</h1>
      </div>
      <section className="dashboard-sections">
        <Link href="/wine-database" className="workspace-card">
          <span className="card-icon" aria-hidden="true">
            ↗
          </span>
          <h2>{t("Wine database")}</h2>
          <p>{t("Wine records, supplier prices and cost references.")}</p>
          <span className="text-link">{t("Open wine database")} →</span>
        </Link>
      </section>
    </main>
  );
}
