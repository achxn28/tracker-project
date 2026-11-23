# Summer 2027 Opportunity Tracker

A local personal research outreach and internship tracker with opportunity creation,
viewing, editing, deletion, and manual activity logging.
Product requirements are documented in [specs.md](specs.md).

## Stack

- Next.js App Router and React
- TypeScript
- Tailwind CSS and shadcn/ui
- Lucide icons
- SQLite through Node.js, with data stored on this computer

## Local development

Use Node.js 24 or later and npm.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The homepage opens the opportunity
list. Both development and production servers bind to `127.0.0.1` for local use.
There is no sign-in or cloud database.

## Local data

The database is created automatically at `data/opportunities.sqlite`. Records
persist across refreshes and server restarts. This folder is ignored by Git.
To back up your records, stop the server and copy the database file somewhere safe.
`OPPORTUNITY_DB_PATH` can select another database file, including a disposable
database for manual testing. Do not deploy this unauthenticated local app online.

## Checks and production build

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`typecheck` generates Next.js route types before checking TypeScript. `npm start`
serves the production build after `npm run build` succeeds.

Tests use disposable databases and check validation, CRUD, activity history,
pipeline changes, distinct outreach counts, date boundaries, and persistence
across a separate Node.js process. They do not touch your saved opportunities.

## Activity logging

Open an opportunity and select **Log activity** to record an email, application,
reply, meeting, interview, offer, rejection, or note. History is shown newest first.
Activity times are entered and displayed in America/New_York and stored in UTC.
Spring daylight-saving times that do not exist are rejected; repeated fall times
use their earlier occurrence.

Initial outreach and applications advance early opportunities to Contacted or
Submitted. Replies, meetings, and offers advance the pipeline; a rejection closes
an open opportunity as rejected. Logging never regresses a later stage or reopens
a closed record. Backdated activities are retained without replacing newer
pipeline information.

For emails, an optional follow-up date is suggested seven calendar days later.
Checking **Set a follow-up date** saves it as the opportunity's Next action.
Existing next actions are preserved unless you explicitly choose to replace them.
Repeated emails and follow-ups do not inflate distinct initial outreach counts.
Deleting an opportunity also deletes its activity history after confirmation.

Tasks, goals, the action queue, and the timeline are later milestones.
