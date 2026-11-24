# Connect the Novus client CRMs

The Novus Clients page is configured for the four supplied spreadsheets:
Asian American Federation, Cypress Hills, Brooklyn Chamber, and Bayside Village
BID. It reads their existing `Business record` tab and edits individual cells.
The app does not copy sheet records into the opportunity database or Git.

Codex's Google Drive connection does not authorize this Next.js app. Complete
this one-time Google Cloud setup for the account you want to use in the app.

## Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or
   create your project. Enable the **Google Sheets API**.
2. Configure the Google Auth Platform consent screen. For a personal external
   app in Testing, add your Google account as a test user. Request the scope
   `https://www.googleapis.com/auth/spreadsheets`.
3. Create an **OAuth client ID** with application type **Web application**.
4. Add this authorized redirect URI exactly:
   `http://127.0.0.1:3000/api/google/callback`.
5. Create `.env.local` at the repository root, using the actual client ID and
   secret from Google Cloud:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google/callback
   ```

6. Restart `npm run dev`. Open **Novus Clients**, select **Connect Google**, and
   authorize the account with edit access to the four sheets.

Keep credentials in `.env.local`, which is ignored by Git; do not paste them into
chat or commit them. Google access/refresh tokens are stored only on this computer
in ignored `data/google/tokens.json`, with owner-only file permissions.

If using a different port, change the redirect URI in both Google Cloud and
`.env.local` to match. Use the same hostname in your browser and redirect URI
(`127.0.0.1` by default) so the OAuth state cookie is available on callback.
The app accepts only localhost HTTP callback URLs.

Google's Sheets permission covers spreadsheets accessible to the authorized
account. The app's request adapter only permits the four configured CRM IDs.
Account sharing/access restrictions still apply. Testing-mode Google apps can
require reconnection when Google expires their refresh tokens.

## Read and edit records

Select a partner, then use **Refresh from Sheets** to load current records.
Records are read in pages of 100 sheet rows. Search and stage filters apply to
the current page. Previous/Next records navigates other sheet rows.

Use **Edit**, change the desired fields, then **Save changes to Sheets**. This
writes only the changed cells to the original sheet, preserving other values,
formatting, and validation. Values are written as literal text, so text beginning
with `=` does not become a spreadsheet formula. Stage choices come from each
cell's existing dropdown. Formula cells, numeric/boolean values, merged cells,
unsupported validation rules, and protected cells you cannot edit are read-only.
Bayside currently has six named columns; the other sheets expose a seventh notes
column. Blank unnamed columns are not created or filled.

Before saving, the app re-reads the headers and row. A changed or moved row causes
a conflict and requires a refresh. This check is not an atomic lock on Google
Sheets: an edit made by someone else in the brief interval between the check and
the write can still race. Finish a small edit promptly and refresh before your
next edit when collaborating. No rows are inserted, deleted, or sorted by the app.

If a save fails or its response is lost, cancel editing and refresh before another
save. The app does not automatically retry writes or claim a failed response means
nothing changed. Successful writes reload the page of records from Google.

**Disconnect locally** removes this app's token file. It does not change the CRM
sheets or revoke your Google account permissions. To revoke the app's grant too,
remove its connection in your Google Account's third-party connections settings.

## Validation and limits

Automated tests use synthetic records and mocked Google responses. They verify
OAuth state/PKCE, token refresh and private persistence, exact cell updates,
dropdown rules, conflicts, protected/formula cells, and grid boundaries.

A real-account read/write check remains pending until OAuth credentials are
configured and the account is authorized. No test changes are made to live client
records during setup or automated tests. After connecting, verify a deliberate
real edit in the original sheet before relying on the integration for daily work.

References: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Sheets get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get),
[Sheets batch updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate).
