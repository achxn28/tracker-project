import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { gmailAuthorization, gmailConfig, gmailConnection, gmailOAuthCookie, gmailScope } from "../src/lib/gmail-connection.ts";
import { googleRequestHostMatches, validGoogleState } from "../src/lib/google-oauth.ts";
import { googleConfig, oauthCookie } from "../src/lib/google-connection.ts";

const env = { GMAIL_CLIENT_ID: "123-gmail.apps.googleusercontent.com", GMAIL_CLIENT_SECRET: "mock-secret", GMAIL_DATA_KEY: "a".repeat(64) };
const authResponse = { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: gmailScope };
const profile = { emailAddress: "Researcher@school.example" };

function localConfig(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "tracker-gmail-connection-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { ...gmailConfig(env)!, tokenPath: join(directory, "gmail", "tokens.enc") };
}

test("Gmail requires separate OAuth credentials and a loopback callback", () => {
  assert.equal(gmailConfig({}), null);
  assert.equal(gmailConfig({ GOOGLE_CLIENT_ID: "sheets-id", GOOGLE_CLIENT_SECRET: "sheets-secret" }), null);
  for (const clientId of [env.GMAIL_CLIENT_ID, "123-sheets.apps.googleusercontent.com"]) {
    assert.throws(() => gmailConfig({ ...env, GOOGLE_CLIENT_ID: clientId }), /separate Google Cloud project/);
  }
  assert.throws(() => gmailConfig({ ...env, GMAIL_DATA_KEY: "invalid" }), /32-byte hex key/);
  for (const uri of ["https://example.com/api/gmail/callback", "http://localhost:3000/api/google/callback", "http://localhost/api/gmail/callback?next=elsewhere"]) {
    assert.throws(() => gmailConfig({ ...env, GMAIL_REDIRECT_URI: uri }), /localhost Gmail callback/);
  }
  const sheets = googleConfig({ GOOGLE_CLIENT_ID: "sheets-id", GOOGLE_CLIENT_SECRET: "sheets-secret" })!;
  const gmail = gmailConfig(env)!;
  assert.notEqual(sheets.tokenPath, gmail.tokenPath);
  assert.notEqual(gmailOAuthCookie, oauthCookie);
  assert.equal(new URL(gmail.redirectUri).pathname, "/api/gmail/callback");
});

test("Gmail requests one scope with fresh PKCE and checks callback host and state", () => {
  const config = gmailConfig(env)!;
  const { state, url } = gmailAuthorization(config, 1000);
  const parameters = new URL(url).searchParams;
  assert.equal(parameters.get("scope"), gmailScope);
  assert.equal(parameters.get("code_challenge_method"), "S256");
  assert.equal(parameters.get("client_secret"), null);
  assert.equal(validGoogleState(JSON.stringify(state), state.state, 2000)?.verifier, state.verifier);
  assert.equal(validGoogleState(JSON.stringify(state), state.state, 602000), null);
  assert.equal(googleRequestHostMatches(config, new Request(config.redirectUri, { headers: { host: "127.0.0.1:3000" } })), true);
  assert.equal(googleRequestHostMatches(config, new Request(config.redirectUri, { headers: { host: "example.com" } })), false);
});

test("Gmail tokens are encrypted, refresh across instances, and revoke on disconnect", async t => {
  const config = localConfig(t);
  let clock = 1000;
  const requests: { url: string; body?: URLSearchParams }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body as URLSearchParams | undefined;
    requests.push({ url, body });
    if (url.endsWith("/token")) {
      return Response.json(body?.get("grant_type") === "authorization_code" ? authResponse : { access_token: "access-2", expires_in: 3600 });
    }
    if (url.includes("/profile?")) {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access-1");
      return Response.json(profile);
    }
    if (url.endsWith("/revoke")) return new Response(null, { status: 200 });
    throw new Error("Unexpected Google call");
  };
  const connection = gmailConnection(config, fetcher, () => clock);
  const mailbox = await connection.exchange("auth-code", "pkce");
  assert.equal(mailbox.email, "researcher@school.example");
  assert.equal(requests[0].body?.get("code_verifier"), "pkce");
  assert.equal(statSync(config.tokenPath).mode & 0o777, 0o600);
  const file = readFileSync(config.tokenPath);
  for (const secret of [authResponse.access_token, authResponse.refresh_token, mailbox.email]) assert.equal(file.includes(secret), false);
  assert.throws(() => gmailConnection({ ...config, encryptionKey: Buffer.alloc(32) }, fetcher).mailbox(), /could not be read/);
  const reopened = gmailConnection(config, fetcher, () => clock);
  assert.deepEqual(reopened.mailbox(), mailbox);
  assert.equal((await reopened.access()).accessToken, "access-1");
  clock += 3600000;
  assert.deepEqual(await reopened.access(), { ...mailbox, accessToken: "access-2" });
  assert.equal(requests[2].body?.get("refresh_token"), "refresh-1");
  await reopened.disconnect();
  assert.equal(requests[3].body?.get("token"), "refresh-1");
  assert.equal(reopened.mailbox(), null);
  assert.deepEqual(await reopened.exchange("another-code", "pkce"), mailbox);
});

test("declined grants, broader grants, and failed profiles create no local token", async t => {
  const config = localConfig(t);
  for (const value of [
    { ...authResponse, scope: "" },
    { ...authResponse, scope: gmailScope + " https://www.googleapis.com/auth/gmail.modify" },
    { ...authResponse, refresh_token: undefined },
  ]) {
    const connection = gmailConnection(config, async () => Response.json(value));
    await assert.rejects(connection.exchange("auth-code", "pkce"));
    assert.equal(connection.mailbox(), null);
  }
  const connection = gmailConnection(config, async input =>
    String(input).endsWith("/token") ? Response.json(authResponse) : new Response(null, { status: 403 }));
  await assert.rejects(connection.exchange("auth-code", "pkce"), /identify the Gmail mailbox/);
  assert.equal(connection.mailbox(), null);
});

test("failed revocation keeps the connection and another account cannot overwrite it", async t => {
  const config = localConfig(t);
  let email = profile.emailAddress;
  const connection = gmailConnection(config, async input => {
    const url = String(input);
    if (url.endsWith("/token")) return Response.json(authResponse);
    if (url.includes("/profile?")) return Response.json({ emailAddress: email });
    return new Response(null, { status: 503 });
  });
  const original = await connection.exchange("first", "pkce");
  email = "other@school.example";
  await assert.rejects(connection.exchange("second", "pkce"), /Disconnect the current Gmail mailbox/);
  await assert.rejects(connection.disconnect(), /could not revoke/);
  assert.deepEqual(connection.mailbox(), original);
});
