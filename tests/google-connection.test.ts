import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { googleAuthorization, googleConfig, googleConnection, googleScope, validGoogleState } from "../src/lib/google-connection.ts";

const config = { clientId: "test-client", clientSecret: "test-secret", redirectUri: "http://127.0.0.1:3000/api/google/callback", tokenPath: "unused" };
test("Google connection requires explicit credentials and a local callback", () => {
  assert.equal(googleConfig({}), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })?.redirectUri, config.redirectUri);
  for (const uri of ["https://example.com/api/google/callback", "http://127.0.0.1:3000/other", "http://user@localhost/api/google/callback", "http://localhost/api/google/callback?next=elsewhere"]) assert.throws(() => googleConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: uri }));
});
test("OAuth uses expiring state and PKCE without placing the secret in its URL", () => {
  const result = googleAuthorization(config, 1000);
  const url = new URL(result.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), googleScope);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("client_secret"), null);
  assert.equal(validGoogleState(JSON.stringify(result.state), result.state.state, 2000)?.verifier, result.state.verifier);
  assert.equal(validGoogleState(JSON.stringify(result.state), "x".repeat(43), 2000), null);
  assert.equal(validGoogleState(JSON.stringify(result.state), result.state.state, 602000), null);
  assert.equal(validGoogleState(JSON.stringify(result.state), result.state.state, 999), null);
  assert.equal(validGoogleState("bad", null), null);
});
test("tokens persist privately, refresh, and are removed on local disconnect", async t => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-google-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const local = { ...config, tokenPath: join(directory, "google", "tokens.json") };
  let clock = 1000; const bodies: URLSearchParams[] = [];
  const fetcher = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(init?.body as URLSearchParams);
    return Response.json(bodies.length === 1 ? { access_token: "first", refresh_token: "refresh", expires_in: 3600, scope: googleScope } : { access_token: "second", expires_in: 3600 });
  }) as typeof fetch;
  const connection = googleConnection(local, fetcher, () => clock);
  assert.equal(connection.connected(), false);
  await connection.exchange("code", "verifier");
  assert.equal(bodies[0].get("code_verifier"), "verifier");
  assert.equal(statSync(local.tokenPath).mode & 0o777, 0o600);
  assert.equal(await connection.accessToken(), "first");
  clock += 3600000;
  assert.equal(await connection.accessToken(), "second");
  assert.equal(bodies[1].get("grant_type"), "refresh_token");
  assert.equal(bodies[1].get("refresh_token"), "refresh");
  assert.equal(JSON.parse(readFileSync(local.tokenPath, "utf8")).refresh_token, "refresh");
  assert.equal(googleConnection(local).connected(), true);
  connection.disconnect(); assert.equal(connection.connected(), false);
  await assert.rejects(connection.accessToken(), /Connect Google/);
});
test("reconnecting another account never inherits the previous account refresh token", async t => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-google-account-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let call = 0;
  const connection = googleConnection({ ...config, tokenPath: join(directory, "tokens.json") }, (async () => Response.json(++call === 1 ? { access_token: "account-one", refresh_token: "old-refresh", expires_in: 3600 } : { access_token: "account-two", expires_in: 3600 })) as typeof fetch);
  await connection.exchange("first", "one"); await connection.exchange("second", "two");
  assert.equal(JSON.parse(readFileSync(join(directory, "tokens.json"), "utf8")).refresh_token, undefined);
});

test("failed or partial Google grants never create a saved connection", async t => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-google-denied-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const local = { ...config, tokenPath: join(directory, "tokens.json") };
  for (const response of [Response.json({ error: "invalid_grant" }, { status: 400 }), Response.json({ access_token: "token", expires_in: 3600, scope: "unrelated" })]) {
    const connection = googleConnection(local, (async () => response) as typeof fetch);
    await assert.rejects(connection.exchange("code", "verifier"));
    assert.equal(connection.connected(), false);
  }
});
