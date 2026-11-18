import type { SupabaseClient } from "@supabase/supabase-js";
export type AccessError =
  | "email"
  | "send"
  | "rate-limit"
  | "expired"
  | "unapproved"
  | "unavailable"
  | "invitation"
  | "email-delivery"
  | "email-disabled"
  | "account-blocked"
  | "email-service"
  | "sign-out";
export const SIGN_IN_PATH = "/sign-in";
export const DATABASE_PATH = "/wine-database";
export const AUTH_ERRORS = [
  "email",
  "send",
  "rate-limit",
  "expired",
  "unapproved",
  "unavailable",
  "invitation",
  "email-delivery",
  "email-disabled",
  "account-blocked",
  "email-service",
  "sign-out",
] as const;
export type SignInDiagnostic = { code?: string; status?: number };
export function signInRequestError(error: SignInDiagnostic): AccessError {
  if (
    error.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code ?? "",
    )
  )
    return "rate-limit";
  if (error.code === "email_address_not_authorized") return "email-delivery";
  if (error.code === "email_provider_disabled") return "email-disabled";
  if (
    ["otp_disabled", "signup_disabled", "user_not_found"].includes(
      error.code ?? "",
    )
  )
    return "invitation";
  if (error.code === "email_address_invalid") return "email";
  if (error.code === "user_banned") return "account-blocked";
  if (error.status && error.status >= 500) return "email-service";
  return "send";
}
export function accessError(value: unknown): AccessError | null {
  return typeof value === "string" && AUTH_ERRORS.includes(value as AccessError)
    ? (value as AccessError)
    : null;
}
export function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export async function requestSignInLink(
  client: SupabaseClient,
  email: string,
  origin: string,
  onFailure?: (diagnostic: SignInDiagnostic) => void,
): Promise<AccessError | null> {
  const address = email.trim();
  if (!validEmail(address)) return "email";
  try {
    const callback = new URL("/auth/callback", origin);
    if (!["http:", "https:"].includes(callback.protocol)) return "unavailable";
    const { error } = await client.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callback.toString(),
      },
    });
    if (error) {
      // Only bounded provider codes and HTTP status may reach the UI. Never
      // expose raw responses, tokens, cookies or server exception messages.
      onFailure?.({
        code:
          typeof error.code === "string" &&
          /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
            ? error.code
            : undefined,
        status:
          typeof error.status === "number" &&
          Number.isInteger(error.status) &&
          error.status >= 400 &&
          error.status <= 599
            ? error.status
            : undefined,
      });
      return signInRequestError(error);
    }
    return null;
  } catch {
    return "unavailable";
  }
}
export type SignInProof =
  { code: string } | { token_hash: string; type: "email" | "invite" };
export function confirmationProof(
  token: unknown,
  type: unknown,
): SignInProof | null {
  return typeof token === "string" &&
    /^[a-zA-Z0-9_-]{20,512}$/.test(token) &&
    (type === "email" || type === "invite")
    ? { token_hash: token, type }
    : null;
}
// These destinations are fixed. Query parameters cannot choose a redirect URL.
export async function finishSignIn(
  client: SupabaseClient,
  proof: SignInProof,
): Promise<string> {
  const fail = (error: AccessError) => `${SIGN_IN_PATH}?error=${error}`;
  if (
    "code" in proof
      ? !proof.code || proof.code.length > 2048
      : !confirmationProof(proof.token_hash, proof.type)
  )
    return fail("expired");
  try {
    const verification =
      "code" in proof
        ? await client.auth.exchangeCodeForSession(proof.code)
        : await client.auth.verifyOtp(proof);
    if (verification.error) return fail("expired");
    // A verified Supabase identity is required before checking team membership.
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return fail("unavailable");
    const access = await client.rpc("wine_can_read");
    if (access.error) return fail("unavailable");
    return access.data === true ? DATABASE_PATH : fail("unapproved");
  } catch {
    return fail("unavailable");
  }
}
export function sameOriginPost(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
