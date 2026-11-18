"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  localeFor,
  translate,
  type Language,
  type TranslationKey,
} from "./dictionaries";
const LanguageContext = createContext<Language>("en");
const SetLanguageContext = createContext<(language: Language) => void>(
  () => {},
);
export function LanguageProvider({
  language: initial,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState(initial);
  function change(next: Language) {
    document.cookie = `gs-hub-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    setLanguage(next);
    router.refresh();
  }
  return (
    <LanguageContext value={language}>
      <SetLanguageContext value={change}>{children}</SetLanguageContext>
    </LanguageContext>
  );
}
export function useI18n() {
  const language = useContext(LanguageContext),
    setLanguage = useContext(SetLanguageContext);
  const locale = localeFor(language);
  const number = (value: number | null | undefined, digits = 2) =>
    value == null || !Number.isFinite(value)
      ? "—"
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(value);
  return {
    language,
    setLanguage,
    t: (key: TranslationKey) => translate(language, key),
    number,
    baht: (value: number | null | undefined) =>
      value == null ? "—" : `THB ${number(value)}`,
    date: (value: string) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "Asia/Bangkok",
      }).format(new Date(value)),
  };
}
