import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmationProof, finishSignIn, sameOriginPost } from "../lib/flow";
function destination(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export async function callback(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code || code.length > 2048)
    return destination(request, "/sign-in?error=expired");
  try {
    return destination(
      request,
      await finishSignIn(await createClient(), { code }),
    );
  } catch {
    return destination(request, "/sign-in?error=unavailable");
  }
}
export async function verify(request: Request) {
  if (!sameOriginPost(request))
    return new Response(null, {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return destination(request, "/sign-in?error=expired");
    const raw = await request.text();
    if (raw.length > 4096)
      return destination(request, "/sign-in?error=expired");
    const body = new URLSearchParams(raw),
      proof = confirmationProof(body.get("token_hash"), body.get("type"));
    if (!proof) return destination(request, "/sign-in?error=expired");
    return destination(
      request,
      await finishSignIn(await createClient(), proof),
    );
  } catch {
    return destination(request, "/sign-in?error=unavailable");
  }
}
