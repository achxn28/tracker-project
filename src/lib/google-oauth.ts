import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type GoogleOAuthClient = { clientId: string; redirectUri: string };
export type GoogleState = { state: string; verifier: string; createdAt: number };

export const googleOAuthMaxAge = 600;

export function startGoogleAuthorization(config: GoogleOAuthClient, scope: string, now = Date.now()) {
  const state: GoogleState = { state: randomBytes(32).toString("base64url"), verifier: randomBytes(48).toString("base64url"), createdAt: now };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope, access_type: "offline", prompt: "consent", state: state.state, code_challenge: createHash("sha256").update(state.verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return { state, url: url.toString() };
}
export function googleRequestHostMatches(config: Pick<GoogleOAuthClient, "redirectUri">, request: Request) {
  return request.headers.get("host")?.toLowerCase() === new URL(config.redirectUri).host;
}
export function validGoogleState(raw: string | undefined, actual: string | null, now = Date.now()): GoogleState | null {
  try {
    const state = JSON.parse(raw ?? "") as GoogleState;
    if (typeof actual !== "string" || !/^[\w-]{43}$/.test(actual) || typeof state.state !== "string" || !/^[\w-]{64}$/.test(state.verifier) || !Number.isFinite(state.createdAt) || now - state.createdAt > googleOAuthMaxAge * 1000 || now < state.createdAt) return null;
    const expected = Buffer.from(state.state); const received = Buffer.from(actual);
    return expected.length === received.length && timingSafeEqual(expected, received) ? state : null;
  } catch { return null; }
}
