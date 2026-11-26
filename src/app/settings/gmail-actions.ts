"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { gmailConfig, gmailConnection } from "@/lib/gmail-connection";

export async function disconnectGmail() {
  let notice = "revoke-failed";
  try {
    const config = gmailConfig();
    if (config) {
      const { port } = new URL(config.redirectUri);
      const host = (await headers()).get("host")?.toLowerCase();
      const loopback = ["127.0.0.1", "localhost"].some(name => host === (port ? `${name}:${port}` : name));
      if (loopback) {
        await gmailConnection(config).disconnect();
        notice = "disconnected";
      }
    }
  } catch {
    // Keep the saved authorization when revocation fails.
  }
  redirect(`/settings?gmail=${notice}`);
}
