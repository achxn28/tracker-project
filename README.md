# Summer 2027 Opportunity Tracker

A local personal research outreach and internship tracker with opportunity creation,
viewing, editing, archiving, manual activity logging, tasks, goals, a shared timeline,
and an action queue.
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
Use the navigation to switch between Dashboard, Timeline, Opportunities, Tasks,
Goals, and Settings.
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

For emails, an optional follow-up date is suggested seven calendar days later by
default. Change this interval in Settings.
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
counts. Dashboard milestone totals use distinct recorded opportunities; recent activity
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

## Timeline

The Timeline page combines tasks and goals on one date axis. Switch between daily,
weekly, and monthly scales, choose a starting date, or pan to earlier/later work.
Blocks use saved start/end dates; due-date-only tasks use diamond markers. Tasks
without due dates stay in a separate list without invented schedule ranges.
Goal fill shows measured progress, never elapsed time. Select a row or block to
open the task or goal. Clipped blocks continue outside the selected date range.


## Opportunity views and archiving

Search by organization, contact, title, or focus. Combine type, status, priority,
deadline, and archive filters, then sort by newest saved, pipeline, type, priority,
deadline, or last recorded activity. The table and status board share the filters.
Select a board card to open its details and edit its status.

Archive an opportunity from its details to hide it from the default list and
opportunity action queue. Archived records retain their activities and goal credit.
Their independent pending tasks remain actionable. Use the archive filter to find
and restore records.

## Settings and exports

Settings saves a follow-up interval from 1 to 365 calendar days in SQLite. Theme
choice uses a browser cookie and persists across refreshes. New follow-up suggestions
use the interval; saved reminders keep their dates until edited.

Download all opportunities or all activities from Settings as UTF-8 CSV, including
archived records. CSV cells preserve commas, quotes, and line breaks, and potential
spreadsheet formulas are escaped as text. Activity timestamps use UTC. CSV exports
are for viewing your records; copy the stopped SQLite database for a full backup
that includes tasks, goals, and preferences. CSV import is not included.

## Manual MVP check

For a clean test without your saved data, set `OPPORTUNITY_DB_PATH` to a temporary
SQLite path before starting the server. Add an opportunity, log initial outreach,
and add a goal for that opportunity type. Verify that a repeat email does not add
a new contact, while a new contact updates the goal. Create a ranged task and a
due-date-only task, then inspect Days and Months on Timeline. Check the dashboard,
archive and restore an opportunity, save preferences, and download both CSV files.
Restart the server with the same database path to verify persistence.


## Workspace appearance and calendar

The workspace uses translucent glass panels in light and dark themes, with
text-only navigation and actions. The dashboard puts due work first and includes
a month calendar. Select a day to see pending tasks, unfinished active goals,
unsubmitted application deadlines, and planned follow-ups or other next actions.
Open the full timeline for task and goal ranges. Undated tasks do not
receive invented calendar dates. Archived and closed opportunity reminders are
excluded. A next action matching a pending linked task appears once, as the task.
Application deadlines disappear after a submission is logged or the pipeline
advances past preparation; planned next actions remain until cleared or resolved.

Task cards, dashboard task rows, and timeline task blocks use the same due-date
colors: green for more than seven days remaining, yellow for four to seven days,
amber for one to three days, and red for today or overdue. Text labels retain the
actual dates and remaining time. Completed and undated tasks are neutral. Date
colors use the New York calendar date when the page loads or refreshes.

## Novus client CRMs

The Novus Clients page connects the four supplied partner Google Sheets through
Google OAuth. Select a partner, load current records, filter the current page,
and explicitly save changed fields back to its original `Business record` tab.
Sheet records are not copied into SQLite. Formula/protected cells remain
read-only, and a fresh row check rejects stale edits.

Complete [Google Sheets setup](docs/google-sheets-setup.md) to enable the app's
own Google authorization. Until configured, the page displays setup guidance and
links to the four original sheets. Automated tests use mocked Google responses;
live write verification requires your authorized Google account.

## Research outreach

The **Research outreach** tab at `/research` shows research opportunities in
one professor-focused workspace. Add a university or lab, professor name and
email, research focus, and paper or personalization notes. Track outreach in
table or board view, log emails and replies, and schedule follow-ups.

These are the same records shown in Opportunities, so existing research
contacts appear here automatically. Activities and follow-ups continue to
feed the dashboard, calendar, and goal progress. Logging an email records
an action you performed; it does not send email or connect to Gmail.
