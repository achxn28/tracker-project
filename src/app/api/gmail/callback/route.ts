import { cookies } from "next/headers";
import { gmailConfig, gmailConnection, gmailOAuthCookie } from "@/lib/gmail-connection";
import { googleRequestHostMatches, validGoogleState } from "@/lib/google-oauth";

export async function GET(request: Request) {
  let config;
  try {
    config = gmailConfig();
  } catch {
    return Response.redirect(new URL("/settings?gmail=setup-error", request.url), 303);
  }
  if (!config) return Response.redirect(new URL("/settings?gmail=setup", request.url), 303);

  const result = new URL("/settings", config.redirectUri);
  const incoming = new URL(request.url);
  const cookieStore = await cookies();
  const state = validGoogleState(cookieStore.get(gmailOAuthCookie)?.value, incoming.searchParams.get("state"));
  cookieStore.set(gmailOAuthCookie, "", { httpOnly: true, sameSite: "lax", path: "/api/gmail", maxAge: 0 });

  let notice = "failed";
  const code = incoming.searchParams.get("code");
  if (state && googleRequestHostMatches(config, request)) {
    if (incoming.searchParams.has("error")) notice = "cancelled";
    else if (code) {
      try {
        await gmailConnection(config).exchange(code, state.verifier);
        notice = "connected";
      } catch {
        // Status is shown in Settings without exposing provider or credential details.
      }
    }
  }
  result.searchParams.set("gmail", notice);
  return Response.redirect(result, 303);
}
