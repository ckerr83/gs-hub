import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Configuration-only check: no network request, user data, or tables required.
export async function GET() {
  try {
    await createClient();

    return Response.json(
      { configured: true, message: "Supabase client configuration is ready." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        configured: false,
        message:
          "Supabase configuration is missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
