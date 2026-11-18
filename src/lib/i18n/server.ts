import "server-only";
import { cookies } from "next/headers";
import type { Language } from "./dictionaries";
export async function getLanguage(): Promise<Language> {
  return (await cookies()).get("gs-hub-language")?.value === "th" ? "th" : "en";
}
