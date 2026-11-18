import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { AppHeader } from "@/components/app-header";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/provider";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
const thaiFont = localFont({
  variable: "--font-thai",
  src: [
    {
      path: "../assets/fonts/NotoSansThai-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../assets/fonts/NotoSansThai-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "GS Hub", template: "%s | GS Hub" },
    description: translate(
      await getLanguage(),
      "Wine records, supplier prices and cost references.",
    ),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const language = await getLanguage();
  return (
    <html
      lang={language}
      className={`${geistSans.variable} ${geistMono.variable} ${thaiFont.variable} h-full antialiased`}
    >
      <body className="gs-hub">
        <LanguageProvider language={language}>
          <a className="skip-link" href="#main-content">
            {translate(language, "Skip to content")}
          </a>
          <AppHeader />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
