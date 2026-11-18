"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import {
  requestSignInLink,
  type AccessError,
  type SignInDiagnostic,
} from "../lib/flow";
import { accessMessages } from "../lib/messages";
export function SignInForm({
  initialError,
}: {
  initialError: AccessError | null;
}) {
  const { t } = useI18n(),
    id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<AccessError | null>(initialError);
  const [diagnostic, setDiagnostic] = useState<SignInDiagnostic | null>(null);
  const [pending, setPending] = useState(false),
    [sent, setSent] = useState(false),
    [cooldown, setCooldown] = useState(false);
  useEffect(() => {
    if (cooldown) {
      const timer = setTimeout(() => setCooldown(false), 60_000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || cooldown) return;
    setPending(true);
    setError(null);
    setDiagnostic(null);
    setSent(false);
    try {
      const result = await requestSignInLink(
        createClient(),
        email,
        window.location.origin,
        setDiagnostic,
      );
      setError(result);
      if (result === "rate-limit") setCooldown(true);
      if (!result) {
        setSent(true);
        setCooldown(true);
      }
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
    }
  }
  return (
    <main id="main-content" className="workspace-main access-main">
      <section className="access-card" aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`}>{t("Sign in to GS Hub")}</h1>
        <p className="access-intro">
          {t(
            "Use your invited team email address. Public sign-up is not available.",
          )}
        </p>
        <form onSubmit={submit} noValidate>
          <label className="access-field" htmlFor={`${id}-email`}>
            {t("Email address")}
            <input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={error === "email"}
              aria-describedby={error ? `${id}-error` : undefined}
              disabled={pending}
            />
          </label>
          {error && (
            <p
              id={`${id}-error`}
              className="access-message access-error"
              role="alert"
            >
              {t(accessMessages[error])}
              {diagnostic && (diagnostic.code || diagnostic.status) && (
                <span className="access-diagnostic">
                  {t("Error code")}:{" "}
                  <code>{diagnostic.code ?? diagnostic.status}</code>
                </span>
              )}
            </p>
          )}
          {sent && (
            <div className="access-message" role="status">
              <strong>{t("Check your email")}</strong>
              <p>
                {t(
                  "If this address has been invited, a sign-in link will arrive shortly.",
                )}
              </p>
              <p>
                {t("Open the link in the same browser where you requested it.")}
              </p>
            </div>
          )}
          <button
            className="button button-primary access-submit"
            type="submit"
            disabled={pending || cooldown}
          >
            {t(
              pending
                ? "Requesting link…"
                : sent
                  ? "Send another link"
                  : "Send sign-in link",
            )}
          </button>
          {cooldown && (
            <p className="access-help" role="status">
              {t("Wait a minute before requesting another link.")}
            </p>
          )}
        </form>
        <p className="access-help">
          {t("Need an invitation? Contact your GS Hub administrator.")}
        </p>
      </section>
    </main>
  );
}
