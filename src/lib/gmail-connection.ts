import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decryptGmailData, encryptGmailData, gmailLocalIdentifier } from "./gmail-local-data.ts";
import { normalizeGmailAddress } from "./gmail-reply-metadata.ts";
import { startGoogleAuthorization } from "./google-oauth.ts";

export const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
export const gmailOAuthCookie = "tracker_gmail_oauth";
export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath: string;
  encryptionKey: Buffer;
};

function projectNumber(clientId?: string) {
  return clientId?.match(/^(\d+)-[^.]+\.apps\.googleusercontent\.com$/)?.[1];
}

export function gmailConfig(env: Record<string, string | undefined> = process.env): GmailConfig | null {
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const key = env.GMAIL_DATA_KEY?.trim();
  if (!clientId || !clientSecret || !key) return null;
  if (!/^[\da-f]{64}$/i.test(key)) throw new Error("Use a 32-byte hex key for Gmail local storage.");

  const sheetsClient = env.GOOGLE_CLIENT_ID?.trim();
  const project = projectNumber(clientId);
  if (clientId === sheetsClient || (project && project === projectNumber(sheetsClient))) {
    throw new Error("Create a separate Google Cloud project for Gmail.");
  }

  const redirectUri = env.GMAIL_REDIRECT_URI || "http://127.0.0.1:3000/api/gmail/callback";
  const url = new URL(redirectUri);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/api/gmail/callback" || url.search || url.hash || url.username || url.password) {
    throw new Error("Use a localhost Gmail callback URL.");
  }
  return {
    clientId, clientSecret, redirectUri, encryptionKey: Buffer.from(key, "hex"),
    tokenPath: join(process.cwd(), "data", "gmail", "tokens.enc"),
  };
}

export function gmailAuthorization(config: GmailConfig, now = Date.now()) {
  return startGoogleAuthorization(config, gmailScope, now);
}

export type GmailMailbox = { mailboxId: string; email: string };
type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
type SavedConnection = Tokens & { email: string };
const timeout = () => AbortSignal.timeout(15000);

export function gmailConnection(config: GmailConfig, fetcher: typeof fetch = fetch, now = Date.now) {
  function read(): { data: SavedConnection; encrypted: Buffer } | null {
    try {
      const encrypted = readFileSync(config.tokenPath);
      const data = JSON.parse(decryptGmailData(config.encryptionKey, "oauth", encrypted)) as Partial<SavedConnection>;
      if (typeof data.email !== "string" || normalizeGmailAddress(data.email) !== data.email ||
          typeof data.accessToken !== "string" || !data.accessToken ||
          typeof data.refreshToken !== "string" || !data.refreshToken ||
          typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt)) {
        throw new Error("Bad Gmail token file.");
      }
      return { data: data as SavedConnection, encrypted };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("The saved Gmail connection could not be read.");
    }
  }

  function write(data: SavedConnection) {
    mkdirSync(dirname(config.tokenPath), { recursive: true, mode: 0o700 });
    const swap = `${config.tokenPath}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      writeFileSync(swap, encryptGmailData(config.encryptionKey, "oauth", JSON.stringify(data)), { mode: 0o600, flag: "wx" });
      renameSync(swap, config.tokenPath);
    } finally {
      rmSync(swap, { force: true });
    }
  }

  function ensureUnchanged(snapshot: ReturnType<typeof read>) {
    const current = read();
    if ((!snapshot && current) || (snapshot && !current?.encrypted.equals(snapshot.encrypted))) {
      throw new Error("The Gmail connection changed. Try again.");
    }
  }

  function mailbox(email: string): GmailMailbox {
    return { mailboxId: gmailLocalIdentifier(config.encryptionKey, "mailbox", email), email };
  }

  async function getTokens(parameters: Record<string, string>, existingRefresh?: string): Promise<Tokens> {
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", redirect: "error", cache: "no-store", signal: timeout(),
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }),
    });
    if (!response.ok) throw new Error("Gmail authorization expired or was declined. Reconnect Gmail.");

    const value = await response.json();
    const accessToken = value?.access_token;
    const refreshToken = value?.refresh_token ?? existingRefresh;
    const duration = value?.expires_in;
    if (typeof accessToken !== "string" || !accessToken || typeof refreshToken !== "string" || !refreshToken ||
        typeof duration !== "number" || !Number.isSafeInteger(duration) || duration <= 0) {
      throw new Error("Google did not return a usable Gmail connection.");
    }
    if (value.scope !== undefined || !existingRefresh) {
      const scopes = typeof value.scope === "string" ? value.scope.trim().split(/\s+/) : [];
      if (scopes.length !== 1 || scopes[0] !== gmailScope) throw new Error("Allow only Gmail read access to connect this mailbox.");
    }
    return { accessToken, refreshToken, expiresAt: now() + duration * 1000 };
  }

  return {
    mailbox() {
      const saved = read();
      return saved ? mailbox(saved.data.email) : null;
    },
    async exchange(code: string, verifier: string) {
      const previous = read();
      const tokens = await getTokens({
        code, code_verifier: verifier, redirect_uri: config.redirectUri, grant_type: "authorization_code",
      });
      const profile = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        redirect: "error", cache: "no-store", signal: timeout(),
      });
      if (!profile.ok) throw new Error("Google could not identify the Gmail mailbox.");
      const value = await profile.json();
      const email = typeof value?.emailAddress === "string" ? normalizeGmailAddress(value.emailAddress) : null;
      if (!email) throw new Error("Google returned an invalid Gmail mailbox.");
      if (previous && previous.data.email !== email) throw new Error("Disconnect the current Gmail mailbox before switching accounts.");
      ensureUnchanged(previous);
      write({ ...tokens, email });
      return mailbox(email);
    },
    async access() {
      const saved = read();
      if (!saved) throw new Error("Connect Gmail before synchronizing.");
      const { email, expiresAt, refreshToken, accessToken } = saved.data;
      if (expiresAt > now() + 60000) return { ...mailbox(email), accessToken };
      const tokens = await getTokens({ grant_type: "refresh_token", refresh_token: refreshToken }, refreshToken);
      ensureUnchanged(saved);
      write({ ...tokens, email });
      return { ...mailbox(email), accessToken: tokens.accessToken };
    },
    async disconnect() {
      const saved = read();
      if (!saved) return;
      const response = await fetcher("https://oauth2.googleapis.com/revoke", {
        method: "POST", redirect: "error", cache: "no-store", signal: timeout(),
        body: new URLSearchParams({ token: saved.data.refreshToken }),
      });
      if (!response.ok) {
        const error = response.status === 400 ? await response.json().catch(() => null) : null;
        if (error?.error !== "invalid_token") throw new Error("Google could not revoke Gmail access. Try again.");
      }
      ensureUnchanged(saved);
      rmSync(config.tokenPath, { force: true });
    },
  };
}
