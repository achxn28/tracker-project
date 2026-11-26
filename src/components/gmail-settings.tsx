import { disconnectGmail } from "@/app/settings/gmail-actions";
import { gmailConfig, gmailConnection } from "@/lib/gmail-connection";

const notices: Record<string, string> = {
  connected: "Gmail connected.",
  cancelled: "Gmail authorization was cancelled.",
  disconnected: "Gmail disconnected and its Google access revoked.",
  failed: "Gmail could not be connected. Try again with the configured account and allow Gmail read access.",
  "revoke-failed": "Gmail access could not be revoked. Try again or remove the Gmail project's access in your Google Account.",
};

function connectionState() {
  try {
    const config = gmailConfig();
    if (!config) return { message: "Gmail setup is required." };
    try {
      return { canConnect: true, mailbox: gmailConnection(config).mailbox() };
    } catch {
      return { message: "The saved Gmail authorization could not be read. Check the local encryption key." };
    }
  } catch {
    return { message: "Check the local Gmail settings and use a separate Google Cloud project from Sheets." };
  }
}

export function GmailSettings({ notice }: { notice?: string }) {
  const state = connectionState();
  const message = notice && Object.hasOwn(notices, notice) ? notices[notice] : state.message;
  return <section className="tracker-panel space-y-4 p-6">
    <div>
      <h2 className="text-lg font-semibold">Gmail</h2>
      <p className="mt-2 text-sm text-muted-foreground">Connect Gmail with read access for Research outreach. The tracker verifies your mailbox when you connect. Email sync is not active yet.</p>
    </div>
    {state.mailbox && <p className="break-words text-sm">Connected as {state.mailbox.email}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {state.canConnect && <div className="flex flex-wrap gap-3">
      <a className="tracker-button" href="/api/gmail/connect">{state.mailbox ? "Reconnect Gmail" : "Connect Gmail"}</a>
      {state.mailbox && <form action={disconnectGmail}><button type="submit" className="tracker-button">Disconnect Gmail</button></form>}
    </div>}
  </section>;
}
