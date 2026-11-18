"use client";
import { AccountControl } from "@/modules/team-access/components/account-control";
import Link from "next/link";
import Image from "next/image";
import logo from "@/assets/gs-import-logo.png";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
export function AppHeader() {
  const pathname = usePathname(),
    { t, language, setLanguage } = useI18n();
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label={t("GS Hub home")}>
          <Image
            className="brand-logo"
            src={logo}
            alt="GS Import"
            width={48}
            height={48}
            sizes="48px"
            preload
          />
          <span className="brand-name">GS Hub</span>
        </Link>
        <nav className="main-nav" aria-label={t("Main navigation")}>
          {[
            { href: "/", label: t("Dashboard") },
            { href: "/wine-database", label: t("Wine database") },
            { href: "/shipments", label: t("Shipments") },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (href === "/" ? pathname === "/" : pathname.startsWith(href))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div
          className="language-switch"
          role="group"
          aria-label={t("Language")}
        >
          <button
            lang="en"
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
          >
            English
          </button>
          <span>/</span>
          <button
            lang="th"
            aria-pressed={language === "th"}
            onClick={() => setLanguage("th")}
          >
            ไทย
          </button>
        </div>
        <AccountControl />
      </div>
    </header>
  );
}
