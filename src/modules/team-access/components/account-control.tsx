"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
export function AccountControl() {
  const { t } = useI18n();
  const [signedIn, setSignedIn] = useState(false),
    [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      // Session events control navigation only. Server identity checks and RLS
      // remain the authorization boundary for every data request.
      const { data } = createClient().auth.onAuthStateChange(
        (event, session) => {
          setSignedIn(!!session?.user);
          if (event === "SIGNED_OUT" && window.location.pathname !== "/sign-in")
            window.location.replace("/sign-in");
        },
      );
      return () => data.subscription.unsubscribe();
    } catch {
      /* Sign-in page reports missing configuration. */
    }
  }, []);
  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) {
        setFailed(true);
        return;
      }
      setSignedIn(false);
      // A full navigation also removes authenticated wine data from client state.
      window.location.replace("/sign-in");
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="account-control">
      {signedIn ? (
        <button
          className="account-button"
          type="button"
          onClick={signOut}
          disabled={pending}
        >
          {t(pending ? "Signing out…" : "Sign out")}
        </button>
      ) : (
        <Link className="account-button" href="/sign-in">
          {t("Sign in")}
        </Link>
      )}
      {failed && (
        <span className="account-error" role="alert">
          {t("Sign-out could not be confirmed. Please try again.")}
        </span>
      )}
    </div>
  );
}
