import type { Metadata } from "next";
import Link from "next/link";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
import { confirmationProof } from "./lib/flow";
import "./styles.css";
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLanguage(), "Confirm sign-in"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
// GET displays a confirmation only. Email link previews do not consume tokens.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams,
    language = await getLanguage();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const proof = confirmationProof(params.token_hash, params.type);
  return (
    <main id="main-content" className="workspace-main access-main">
      <section className="access-card">
        <h1>{t("Confirm sign-in")}</h1>
        {proof && "token_hash" in proof ? (
          <>
            <p className="access-intro">
              {t(
                "Continue to sign in with your email invitation or sign-in link.",
              )}
            </p>
            <form method="post" action="/auth/verify">
              <input type="hidden" name="token_hash" value={proof.token_hash} />
              <input type="hidden" name="type" value={proof.type} />
              <button
                className="button button-primary access-submit"
                type="submit"
              >
                {t("Continue sign-in")}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="access-message access-error" role="alert">
              {t(
                "This sign-in link is invalid or expired. Request a new link and open it in the same browser.",
              )}
            </p>
            <Link className="button" href="/sign-in">
              {t("Request a new sign-in link")}
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
