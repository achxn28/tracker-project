import { cookies } from "next/headers";
import { gmailAuthorization, gmailConfig, gmailOAuthCookie } from "@/lib/gmail-connection";
import { googleOAuthMaxAge, googleRequestHostMatches } from "@/lib/google-oauth";

export async function GET(request: Request) {
  let config;
  try {
    config = gmailConfig();
  } catch {
    return Response.redirect(new URL("/settings?gmail=setup-error", request.url), 303);
  }
  if (!config) return Response.redirect(new URL("/settings?gmail=setup", request.url), 303);
  if (!googleRequestHostMatches(config, request)) return Response.redirect(new URL("/api/gmail/connect", config.redirectUri), 303);
  const { state, url } = gmailAuthorization(config);
  (await cookies()).set(gmailOAuthCookie, JSON.stringify(state), {
    httpOnly: true, sameSite: "lax", path: "/api/gmail", maxAge: googleOAuthMaxAge,
  });
  return Response.redirect(url, 303);
}
