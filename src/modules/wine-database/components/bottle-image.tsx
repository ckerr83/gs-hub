"use client";

import { useI18n } from "@/lib/i18n/provider";
import Image from "next/image";
import { useState } from "react";
import type { Wine } from "../types";
import { wineStyle } from "../lib/model";

export function BottleImage({
  wine,
  large = false,
}: {
  wine: Wine;
  large?: boolean;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const style = wineStyle(wine);
  return (
    <div className={`bottle-image ${large ? "bottle-large" : ""}`}>
      {wine.imageUrl && !failed ? (
        <Image
          src={wine.imageUrl}
          alt={`${wine.producer} ${wine.name} ${t("bottle")}`}
          width={large ? 180 : 48}
          height={large ? 230 : 64}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className={`bottle-placeholder bottle-${style.toLowerCase()}`}
          aria-label={t("Bottle photo not available")}
          role="img"
        >
          <span />
        </span>
      )}
    </div>
  );
}
