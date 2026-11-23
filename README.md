# Summer 2027 Opportunity Tracker

A local personal research outreach and internship tracker with opportunity creation,
viewing, editing, deletion, manual activity logging, tasks, and an action queue.
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

Open [localhost:3000](http://localhost:3000). The homepage opens the dashboard.
Use the navigation to switch between Dashboard, Opportunities, and Tasks.
Both development and production servers bind to `127.0.0.1` for local use.
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
Existing custom next actions are preserved unless you explicitly choose to replace them.
Repeated emails and follow-ups do not inflate distinct initial outreach counts.
Sending a follow-up or recording a reply, meeting, offer, or rejection resolves
the prior generated email reminder, unless a replacement date is selected.
Backdated events do not clear a reminder belonging to a newer logged email.
Custom next actions are preserved. Deleting an opportunity also deletes its
activity history after confirmation; linked tasks are kept as standalone tasks.

## Tasks and action queue

Tasks can be standalone or linked to opportunities. Add a title, category, priority,
optional description, and optional start/due dates. Edit, complete, reopen, or delete
tasks from the Tasks page. Filter by category, priority, completion, or opportunity;
dated tasks sort first, with overdue pending tasks called out. Linked tasks also
appear on opportunity details.

The dashboard prioritizes overdue tasks and next actions, approaching application
deadlines, work due today, the upcoming week, and opportunities ready for outreach.
Dates use America/New_York. The seven-day deadline window is inclusive. Submitted
applications and closed opportunities do not generate application reminders.
Completed tasks and undated work do not appear as due work in the queue.

A linked task matching an opportunity's next-action title and date appears once.
Completing that task clears the matching next action. Clearing an action from the
dashboard removes its plan without recording an email or increasing outreach
counts. Three outreach totals use distinct recorded opportunities; recent activity
includes logged events and task completions.

## Goals

Create a custom goal or start from an editable research, startup, application,
accepted-offer, or weekly template. Weekly templates use Monday through Sunday.
Targets and dates remain configurable; templates are saved only when you submit.
Pause a goal through its editor. Completion and progress are derived, not entered.

Each opportunity counts once per milestone, using its earliest qualifying event.
A repeated initial email in a later week is not a new contact. Goal periods include
both dates in New York time and exclude events that have not occurred yet.
Positive replies must be explicitly marked when logging a reply. Received offers
and accepted offers are separate activity types. Meetings/interviews and positive
replies count distinct opportunities; task progress counts completed task records.
Reopening or deleting a task changes derived progress. Deleting a goal preserves
its activities and tasks.

The timeline is a later milestone.
