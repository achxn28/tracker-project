import { cookies } from "next/headers";
import { googleConfig, googleConnection, googleRequestHostMatches, oauthCookie, validGoogleState } from "@/lib/google-connection";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const state = validGoogleState(cookieStore.get(oauthCookie)?.value, url.searchParams.get("state"));
  cookieStore.set(oauthCookie, "", { httpOnly: true, sameSite: "lax", path: "/api/google", maxAge: 0 });
  const config = googleConfig();
  const result = new URL("/clients", config?.redirectUri ?? request.url);
  if (!state || url.searchParams.has("error")) { result.searchParams.set("google", "cancelled"); return Response.redirect(result, 303); }
  const code = url.searchParams.get("code");
  if (!config || !code || !googleRequestHostMatches(config, request)) { result.searchParams.set("google", "failed"); return Response.redirect(result, 303); }
  try { await googleConnection(config).exchange(code, state.verifier); result.searchParams.set("google", "connected"); }
  catch { result.searchParams.set("google", "failed"); }
  return Response.redirect(result, 303);
}
