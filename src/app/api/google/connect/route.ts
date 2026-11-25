import { cookies } from "next/headers";
import { googleAuthorization, googleConfig, googleRequestHostMatches, oauthCookie } from "@/lib/google-connection";

export async function GET(request: Request) {
  const config = googleConfig();
  if (!config) return Response.redirect(new URL("/clients?google=setup", request.url), 303);
  if (!googleRequestHostMatches(config, request)) return Response.redirect(new URL("/api/google/connect", config.redirectUri), 303);
  const { state, url } = googleAuthorization(config);
  (await cookies()).set(oauthCookie, JSON.stringify(state), { httpOnly: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return Response.redirect(url, 303);
}
