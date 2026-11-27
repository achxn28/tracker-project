# Connect a Gmail mailbox

The Gmail connection is separate from the four Novus Sheets CRMs. It requests
only `gmail.readonly`. Connecting reads the mailbox address to verify which
account was authorized. Mailbox checks run on demand in Tracker on your Mac.

1. Create a **separate Google Cloud project** for Gmail. Enable the Gmail API.
   Keep the project used by the Sheets connection separate, since Google
   revokes OAuth grants for the entire project.
2. Set up the consent screen. For a personal External app in Testing, add
   your own Google account as a test user. Add
   `https://www.googleapis.com/auth/gmail.readonly` to the requested scopes.
3. Create a **Web application** OAuth client with authorized redirect URI
   `http://127.0.0.1:3000/api/gmail/callback`. If selecting another local
   port or hostname, update both the authorized URI and the local setting.
4. Add these settings to the existing ignored `.env.local`. Generate a
   separate 32-byte hex key locally, for example with `openssl rand -hex 32`.
   Keep the key stable and keep all credential values out of Git and chat.

   ```dotenv
   GMAIL_CLIENT_ID=your-gmail-client-id
   GMAIL_CLIENT_SECRET=your-gmail-client-secret
   GMAIL_REDIRECT_URI=http://127.0.0.1:3000/api/gmail/callback
   GMAIL_DATA_KEY=your-64-character-hex-key
   ```

5. Restart the tracker and open **Settings → Gmail → Connect Gmail**. Sign in
   as the mailbox you intend to use and review Google's read access prompt.

## Try local task suggestions

Open **Research outreach → Gmail review → Try task suggestions**. Choose a
sample email and click **Suggest task**. Review the quote, edit the proposed
title or date, and approve or dismiss the suggestion. An approved sample is a
regular task labeled as sample data in its description. Reapproving a sample
keeps its first saved task.

The pilot uses Ollama and the local `qwen3:4b` model. Install Ollama and download
that model once. Tracker starts a private loopback Ollama server for each
request with cloud features disabled, then stops it. The pilot uses built-in
sample text and the workspace's existing local encryption key.

## Check and review replies

Open **Research outreach → Gmail review → Check Gmail** to look back up to 30
days. Tracker checks linked conversations and searches for senders whose
addresses are saved on open research opportunities. For an unlinked thread,
Tracker requires a reply reference to a message in Sent. No subject tags are
required. Checks are capped at 100 contacts and 40 conversations and can
report partial coverage.

Each proposed match links back to Gmail. Select the opportunity if an address
matches more than one, then approve to log **Reply received** or dismiss it.
Approve only after checking the match. Approved replies keep their original
Gmail link in the local review history. Link a conversation explicitly from the
same screen using a Gmail link or a Message-ID from Gmail's **Show original**.

Use **Disconnect Gmail** to revoke the Gmail project's grant and remove the
saved credential. The local authorization file lives under `data/gmail/`
and is encrypted using `GMAIL_DATA_KEY`. If that key is lost, revoke the old
project grant in your [Google Account connections](https://myaccount.google.com/connections)
before removing the unreadable token file and reconnecting. Testing-mode grants
can require reconnection after seven days.

The local candidate database in `data/gmail/` encrypts the stored candidate and
uses a keyed mailbox and message pair to reject replays across restarts. No
message bodies, attachments, or raw headers are kept by the matcher. Supabase
continues to store core tracker data, including approved reply activities. The
Gmail IDs, thread links, and sender metadata stay in the encrypted local store.
Before hosting restricted Gmail data, check Google's Limited Use, verification,
and security assessment requirements.

See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke),
[OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration),
and [restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
