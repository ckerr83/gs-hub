import type { TranslationKey } from "@/lib/i18n/dictionaries";
export const errorMessage: Record<string, TranslationKey> = {
  setup:
    "Team sign-in and an approved user roster are required before this database can be used.",
  auth: "Sign in to view the wine database.",
  forbidden: "Access denied. Contact your team administrator.",
  unavailable:
    "Database unavailable. No cached records are shown. Retry after checking Supabase setup.",
  incomplete: "Database changed while loading. Retry to load a complete list.",
  conflict:
    "This wine changed or was archived. Refresh and reopen it before saving.",
  validation:
    "Check the wine details. Numeric values must be valid and non-negative.",
  write: "Save could not be confirmed. Refresh before retrying.",
};
export async function wineRequest<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error ?? (method === "GET" ? "unavailable" : "write"),
    );
  return value as T;
}
