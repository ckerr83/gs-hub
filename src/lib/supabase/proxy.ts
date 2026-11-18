import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Existing pages keep working before Supabase is configured.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    return response;
  }

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        const previousResponse = response;
        response = NextResponse.next({ request });

        // Preserve earlier writes if the SDK calls setAll more than once.
        previousResponse.cookies.getAll().forEach((cookie) =>
          response.cookies.set(cookie),
        );
        for (const name of ["cache-control", "expires", "pragma"]) {
          const value = previousResponse.headers.get(name);
          if (value) response.headers.set(name, value);
        }

        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  // Refresh and validate existing sessions without protecting or redirecting pages.
  await supabase.auth.getClaims();

  return response;
}
