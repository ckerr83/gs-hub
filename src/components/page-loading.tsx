"use client";

import { useI18n } from "@/lib/i18n/provider";

export function PageLoading() {
  const { t } = useI18n();
  return (
    <main id="main-content" className="workspace-main" aria-busy="true">
      <p role="status">{t("Loading…")}</p>
      <div className="page-loading-placeholder" aria-hidden="true">
        <div /><div /><div /><div />
      </div>
    </main>
  );
}
