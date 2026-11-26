import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { startGoogleAuthorization } from "./google-oauth.ts";

export { googleRequestHostMatches, validGoogleState, type GoogleState } from "./google-oauth.ts";

type Tokens = { access_token: string; refresh_token?: string; expires_at: number };
export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string; tokenPath: string };
export const googleScope = "https://www.googleapis.com/auth/spreadsheets";
export const oauthCookie = "tracker_google_oauth";

export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) return null;
  const redirectUri = env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/google/callback";
  const url = new URL(redirectUri);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/api/google/callback" || url.search || url.hash || url.username || url.password) throw new Error("Use a localhost Google callback URL.");
  return { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim(), redirectUri, tokenPath: join(process.cwd(), "data", "google", "tokens.json") };
}
export function googleAuthorization(config: GoogleConfig, now = Date.now()) {
  return startGoogleAuthorization(config, googleScope, now);
}
export function googleConnection(config: GoogleConfig, fetcher: typeof fetch = fetch, now = Date.now) {
  function read(): Tokens | null {
    try {
      const tokens = JSON.parse(readFileSync(config.tokenPath, "utf8")) as Tokens;
      return typeof tokens.access_token === "string" && typeof tokens.expires_at === "number" ? tokens : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("The saved Google connection could not be read. Reconnect Google.");
    }
  }
  function write(tokens: Tokens) {
    mkdirSync(dirname(config.tokenPath), { recursive: true, mode: 0o700 });
    const temporary = `${config.tokenPath}.${randomBytes(8).toString("hex")}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(tokens), { mode: 0o600, flag: "wx" }); renameSync(temporary, config.tokenPath); }
    finally { rmSync(temporary, { force: true }); }
  }
  async function token(body: Record<string, string>, previous?: Tokens | null) {
    const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...body }), cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Google authorization expired or was declined. Reconnect Google.");
    const value = await response.json();
    if (typeof value.access_token !== "string" || typeof value.expires_in !== "number") throw new Error("Google did not return a usable connection.");
    if (value.scope && !value.scope.split(" ").includes(googleScope)) throw new Error("Allow Google Sheets access to connect your CRMs.");
    const tokens: Tokens = { access_token: value.access_token, refresh_token: value.refresh_token || previous?.refresh_token, expires_at: now() + value.expires_in * 1000 };
    write(tokens); return tokens;
  }
  return {
    connected: () => Boolean(read()),
    async exchange(code: string, verifier: string) { await token({ code, code_verifier: verifier, redirect_uri: config.redirectUri, grant_type: "authorization_code" }); },
    async accessToken() {
      let tokens = read();
      if (!tokens) throw new Error("Connect Google before opening a client CRM.");
      if (tokens.expires_at <= now() + 60000) {
        if (!tokens.refresh_token) throw new Error("Your Google connection expired. Reconnect Google.");
        tokens = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }, tokens);
      }
      return tokens.access_token;
    },
    disconnect() { rmSync(config.tokenPath, { force: true }); },
  };
}
