import { cookies } from "next/headers";
import { googleConfig, googleConnection, oauthCookie, validGoogleState } from "@/lib/google-connection";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const state = validGoogleState(cookieStore.get(oauthCookie)?.value, url.searchParams.get("state"));
  cookieStore.set(oauthCookie, "", { httpOnly: true, sameSite: "lax", path: "/api/google", maxAge: 0 });
  const result = new URL("/clients", request.url);
  if (!state || url.searchParams.has("error")) { result.searchParams.set("google", "cancelled"); return Response.redirect(result, 303); }
  const config = googleConfig(); const code = url.searchParams.get("code");
  if (!config || !code || new URL(config.redirectUri).origin !== url.origin) { result.searchParams.set("google", "failed"); return Response.redirect(result, 303); }
  try { await googleConnection(config).exchange(code, state.verifier); result.searchParams.set("google", "connected"); }
  catch { result.searchParams.set("google", "failed"); }
  return Response.redirect(result, 303);
}
