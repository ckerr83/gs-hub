import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
import { SignInForm } from "./components/sign-in-form";
import { accessError, type AccessError } from "./lib/flow";
import "./styles.css";
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLanguage(), "Sign in"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let error: AccessError | null = accessError((await searchParams).error),
    approved = false;
  try {
    const client = await createClient();
    const user = await client.auth.getUser();
    if (user.data.user && !user.error) {
      const access = await client.rpc("wine_can_read");
      approved = !access.error && access.data === true;
      if (!approved) error = access.error ? "unavailable" : "unapproved";
    }
  } catch {
    error = "unavailable";
  }
  if (approved) redirect("/wine-database");
  return <SignInForm initialError={error} />;
}
