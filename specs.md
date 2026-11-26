# Summer 2027 Opportunity Tracker

Product Requirements Specification — Version 1.1

### Current implementation direction — November 22, 2026

The application is now intended for use only on the owner's computer. Use a local
SQLite database, bind the app server to `127.0.0.1`, and omit authentication.
This decision supersedes the Supabase, user-account/RLS, and Vercel hosting
requirements below for the local version. User ownership columns are unnecessary
in the local database. Keep the remaining product workflows and timeline scope.
Implemented milestones cover opportunity creation, listing, viewing, editing,
deletion, manual activity logging, task management, and the dashboard action queue.
Measurable goals and the shared task/goal timeline are also implemented.

## Current MVP scope

The current implementation follows the later product decisions: a personal,
desktop-first app on this computer, with SQLite persistence and no sign-in.
Supabase, RLS, authentication, and online deployment in the original phases below
are deferred. Development and production servers bind to localhost.

Implemented: opportunity CRUD, manual activity logging, tasks and action queue,
measurable goals, the unified daily/week/month timeline, search and combined
filters, table and status-board views, reversible archiving, CSV exports, theme,
and a configurable follow-up interval. The desktop layout uses a left sidebar.
The dashboard also includes a month calendar with a selected-day agenda for
pending tasks, unfinished active goal deadlines, unsubmitted application
deadlines, and planned follow-ups or other opportunity next actions. Use clear glass surfaces,
text-only navigation, and green/yellow/amber/red task urgency as dates approach.
Board cards open the editor for status changes; dragging cards is not included.

Goal progress comes from explicit saved events. Positive replies are marked by
the user, and received and accepted offers are separate activities. Archived
opportunities retain their recorded history and metric credit. CSV exports cover
opportunities and activities; full local backups use the stopped SQLite file.

Google Sheets integration is explicitly included for the four supplied Novus
partner CRMs, on a separate Novus Clients page. It requires this local app’s own
Google OAuth authorization. Reads use the existing Business record tab; explicit
saves update only changed editable cells. CRM records do not contribute to
recruiting metrics or copy into the opportunity database.

Gmail tracking, AI integrations, scraping, and unrelated external APIs remain out
of scope for the current MVP. The following proposal covers a possible next phase.

## macOS launcher

Ship a Dock launcher for this Mac first. Opening Tracker from Applications or
the Dock should start the existing Next.js server from the local checkout and
show the tracker in its own window. Keep the current glass UI, live Supabase
connection, and four Novus Sheets CRMs. Use the existing ignored configuration
and data files in the checkout. This version requires the checkout and its
installed dependencies.

The first implementation step is launch and shutdown. Have the launcher open
the tracker only after its loopback server is ready. If the tracker is already
running, reuse it only after verifying its identity. If another service owns
the port, report the conflict. A second launch should focus the existing window.
Quitting should stop only the server process the launcher started.

Open Gmail and Sheets authorization in the default browser. Start the local
OAuth route there so the browser that receives the callback also holds the
state cookie. Verify window launch, relaunch, tracker data, all four CRM reads,
and CSV exports before relying on the launcher.

A self-contained Mac build can follow if the tracker needs to run independently
of the checkout. That would bundle the server and move configuration and local
data to a stable per-user folder outside the bundle. Vercel hosting is optional
and separate from the launcher.

## Proposed cloud database and Gmail sync — November 24, 2026

The optional Postgres backend, backup, import, and restore commands are
implemented. SQLite remains the default. See the [migration runbook](docs/postgres-migration.md)
for rehearsal and cutover. Gmail sync and extraction are still proposed.

Move the tracker database first while keeping the Next.js app on localhost.
The current store in `src/lib/opportunities.ts` uses synchronous SQLite calls
for opportunities, activities, tasks, goals, and preferences. Google Sheets uses
a separate adapter, a localhost OAuth callback, and a local token file. Keep
the four CRM workbooks as the source of truth for the Novus Clients page.

### 1. Rehearse migration and restore locally

- Stop the app and take a private SQLite snapshot from the configured database
  path. Run integrity and foreign key checks on a copy and prove it restores.
  Run any legacy upgrades for archived opportunities or activity types on a
  disposable copy. The CSV exports omit tasks, goals, and preferences, so use
  the database snapshot for migration and recovery.
- Add versioned Postgres schema migrations and a transactional importer. Try
  synthetic fixtures first, then rehearse with the backup on local Postgres.
  Preserve IDs, links, status and archive fields, notes, timestamps, and nulls.
  Keep calendar dates independent of timezone, retain UTC event instants, and
  preserve the New York date rules and numeric positive-reply flag at the app
  boundary. Preserve activity deletion and task detachment on opportunity delete.
- Add an async server-side store so the app can select SQLite or Postgres
  explicitly. Keep activity logging and task completion transactional, including
  the opportunity stage and reminder changes they can trigger. Verify every
  table by counts and normalized row comparison. Check dashboard and goal totals,
  Research outreach, calendar and timeline dates, exports, and archive behavior
  against the existing store. Use synthetic data for destructive parity checks.

### 2. Switch the data store to Supabase Free

- Rehearse on a Free project with synthetic data before transferring real rows.
  Use TLS and dedicated, least-privilege server roles. Keep tracker tables in
  a private schema or deny anonymous and authenticated API roles access by
  default. Keep database credentials server-side in ignored local configuration.
  Any later public app deployment needs sign-in and owner-level access checks
  for pages, actions, exports, and data before exposure.
- Pause local writes for the final snapshot and import. Verify the destination
  and switch the local app only after the checks pass. Keep SQLite as the sole
  writer until cutover, then Postgres as the sole writer. If validation fails
  before reopening writes, point the app back to SQLite. If Postgres has accepted
  writes, freeze writes and use a rehearsed, verified reverse transfer before
  switching back. Keep private Postgres dumps and test restoring them locally so
  recovery can start during provider unavailability.
- Keep the existing localhost callback, Sheets grant, token file, and explicit
  cell-save flow outside the database migration. Read all four CRMs with the
  existing account and use mocked or disposable data to check protected cells,
  stale-row handling, and writes. Preserve the glass UI and compact corners.
- Supabase lists a 500 MB database, 5 GB uncached egress, inactivity pausing
  after one week, and no automatic backups on Free. Keep recurring off-site
  backups under the owner's control. [Supabase pricing](https://supabase.com/pricing),
  [backup guidance](https://supabase.com/docs/guides/platform/backups).

### 3. Add read-only Gmail sync as a separate integration

The reply matcher is implemented and covered by synthetic fixtures. It uses
header metadata and Gmail's stored timestamp, and skips sent messages, drafts,
spam, trash, self replies, and messages marked as automated or from a mailing
list. Reply headers are evidence for a candidate. A candidate needs review before
it can change tracker records. Matching is limited to open, unarchived research
opportunities. The matcher deduplicates candidates by mailbox and Gmail message
ID. The [local Gmail connection](docs/gmail-setup.md) and the encrypted
local candidate database are implemented and tested with fixtures. The
database stores the source and candidate together under a unique mailbox and
message key. Live mailbox sync, the review UI, and hosted Gmail processing
remain future work.

- Use a separate OAuth client and grant for `gmail.readonly`. It grants mailbox
  read access, so restrict what the worker fetches in code. Keep the Sheets grant
  local and give the worker only the Gmail grant and the database permissions it
  needs. Store worker secrets in a managed secret store and encrypt restricted
  data at rest. Verify whether the personal-use exception applies to the hosted
  design before deploying. Restricted scopes can require verification and a
  third-party security assessment. External Testing refresh tokens for this
  scope expire after seven days. Provide reconnect, revoke, and data deletion
  controls. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification),
  [OAuth token lifetime](https://developers.google.com/identity/protocols/oauth2#expiration),
  [Google Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).
- Use Supabase Cron and a short Edge Function as the first hosted candidate.
  Start with one poll every 30 minutes, about 1,500 invocations in a 31-day month
  before retries. Cap batches and runtime, use one lease per mailbox, and keep
  retry state in Postgres. Show the last successful sync and any pause reason.
  Free includes 500,000 invocations and a 150-second function wall time, with
  separate CPU, storage, and egress limits. If hosting eligibility or availability
  falls short, use a local scheduled job when the computer is on. [Scheduling](https://supabase.com/docs/guides/functions/schedule-functions),
  [function limits](https://supabase.com/docs/guides/functions/limits),
  [Supabase pricing](https://supabase.com/pricing).
- Start with a bounded backfill and known contacts. Prefer explicitly linked
  threads, then exact sender or recipient address matches to a single tracked
  opportunity. Leave shared addresses and ambiguous matches for review. Use
  mailbox and message metadata to distinguish received replies from sent mail.
  Read headers first and skip bodies and attachments during the sync pilot.
- Record a Gmail history checkpoint before scanning the backfill and then
  catch up from that checkpoint. Write source references and queue work durably
  before advancing the cursor, even when extraction is paused. On an expired
  history `404`, repeat the bounded backfill for eligible threads and surface any
  gap outside that window. Use a unique mailbox/message key, and keep retries safe with
  transactionally claimed work and a separate idempotency key for each applied
  change. Preserve the original email in Gmail and link suggestions and applied
  changes to its message/thread reference. Store only metadata needed for the
  feature, with a retention and deletion rule. If reprocessing finds a matching
  manual activity or task, offer to link it instead of adding a duplicate.
  [Gmail sync guide](https://developers.google.com/workspace/gmail/api/guides/sync).

### 4. Evaluate extraction and decide how changes are applied

- Start with synthetic fixtures. Ask the model for structured suggestions with
  evidence for tasks, deadlines, or reply classification. Validate each field,
  allow an unknown result, and surface ambiguous dates or intent. Treat email
  as untrusted input and give the model no tools, credentials, or write access.
  Verify duplicate delivery, interrupted runs, ambiguous matches, contradictory
  due dates, stale suggestions, and recovery from quota failures.
- Recommend review first. Show the source and proposed change, and let the owner
  approve, edit, or dismiss it. Do not let pending suggestions affect counts or
  the action queue. If automatic application is chosen later, begin with
  deterministic reply tracking on explicitly linked threads. Keep model-derived
  deadlines, positive-reply judgments, and conflicting edits in review. Apply
  approved changes through the same tracker rules as manual actions and retain an
  audit record. The application mode is open for decision.
- Keep real mail out of unpaid Gemini. Google says unpaid input can be used
  to improve its products and reviewed by people. Paid-service terms provide
  different handling and still allow limited logging. Before sending any real
  excerpt onward, verify Google Workspace Limited Use, consent, retention, and
  applicable Gemini terms. The Gemini API requires users to be at least 18.
  If these conditions or the cost target rule out Gemini, use deterministic
  reply matching and manual task/deadline entry with source links.
  [Gemini API terms](https://ai.google.dev/gemini-api/terms),
  [Google Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

### Spending and queue behavior

- Aim for $0 additional monthly spend. Google lists $10 USD per month in
  developer credits for AI Pro, eligible for Gemini API usage. This requires
  a linked Developer Program profile and redemption to an eligible Cloud Billing
  account. Account entitlement, redemption, and the project billing mode still
  need confirmation. Google documents a $5 minimum initial deposit for its
  current paid signup flow and requires an active prepaid balance to use eligible
  credits on Prepay. Paid activation or prepayment requires explicit approval.
  [Developer Program benefits](https://developers.google.com/profile/help/benefits#google-cloud-credits),
  [My Benefits](https://me.developers.google.com/benefits),
  [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing).
- Keep paid API calls disabled by default. The proposed $2 monthly application
  budget is undecided. If approved, use it as a gross usage ceiling for this app,
  before credits, and reserve a conservative estimate atomically before each
  request. Bound input, output, request count, and concurrency, and retain the
  reservation for ambiguous timeouts until reconciled. Disable paid dispatch if
  pricing or billing status is unknown and apply backoff for rate limits. When
  budget or quota is exhausted, leave jobs queued with a pause
  reason and a retry time when known. Resume after the limit resets or the owner
  changes the setting. Credits, alerts, and provider caps do not guarantee zero
  charges. [Cloud Billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets),
  [spend cap enforcement](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).

## 1. Product Overview

Build a personal web application to manage the process of securing a software engineering internship or computer science research opportunity for summer 2027.

The application should combine:

- Opportunity CRM: Track professors, research labs, startups, and formal internships.
- Outreach Pipeline: Manage applications, cold emails, responses, interviews, and offers.
- Goal Tracking: Set measurable weekly and long-term goals with automatic progress calculations.
- Task Management: Break down objectives into actionable tasks with deadlines.
- Unified Timeline: Plan tasks and goals together, from daily detail to the full recruiting period.
- Progress Dashboard: Display upcoming actions, overdue items, and recruiting statistics.

The application should emphasize execution, accountability, and organization rather than decorative analytics.

Primary success criterion: Help the user secure at least one meaningful summer 2027 opportunity.

## 2. Technology Stack

- Frontend: Next.js (App Router), React, TypeScript
- Styling: Tailwind CSS and shadcn/ui
- Backend: Next.js Server Actions and server-side logic
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Hosting: Vercel
- Icons: Lucide

Use a clean, modular architecture with reusable components, typed database models, and simple, maintainable code.

The application is initially single-user, but all user-owned data must be scoped to the authenticated user.

## 3. Application Layout

Use a minimal, professional dashboard interface with a left sidebar on desktop and responsive navigation on mobile.

Primary navigation:

1. Dashboard
2. Timeline
3. Opportunities
4. Tasks
5. Goals
6. Settings

Use a light theme by default with optional dark-mode support.

The interface should feel like a modern productivity application, with compact tables, restrained colors, generous whitespace, and clear status indicators.

Avoid unnecessary animation, gamification, or overly elaborate visualizations.

## 4. Dashboard

The dashboard is the application's home screen and should answer:

What should I do today, and how close am I to my goals?

### Summary metrics

Display:

- Research contacts reached
- Startup contacts reached
- Formal applications submitted
- Positive responses received
- Meetings/interviews scheduled or completed
- Offers received

Calculate these values from recorded activities rather than relying on manually entered totals.

### Action Queue

Display prioritized actions:

1. Overdue follow-ups and tasks
2. Application deadlines approaching within seven days
3. Tasks due today
4. Upcoming follow-ups
5. Opportunities marked ready for outreach

Each item should link directly to its associated opportunity or task.

For the local MVP, upcoming tasks, next actions, and application deadlines cover
today through seven calendar days ahead in America/New_York. Overdue pending tasks
and next actions are also shown. Completed tasks and closed opportunity actions
are excluded. Application deadlines are actionable only in pre-contact/application
stages and when no Application submitted activity has been recorded. Matching
linked tasks and next actions (same title and date) appear once. Ready-for-outreach
items are omitted when the opportunity already has queued work.

Clearing a next action removes its planning fields; it does not log outreach.
The local dashboard displays distinct research contacts, startup contacts, formal
applications, positive responses, completed meetings/interviews, and offers
received, plus active goal progress and recent activities/task completions. Offer
acceptance is tracked separately through accepted-offer goals.

### Goal Progress

Display active goals with:

- Goal title
- Current progress
- Target
- Deadline
- Progress bar

Support both weekly and cumulative recruiting goals.

### Recent Activity

Show a chronological feed of recorded outreach, applications, replies, meetings, and completed tasks.

## 5. Opportunity Management

Implement a searchable, filterable database.

Each opportunity represents one specific recruiting target, such as a professor, research group contact, startup position, or formal internship.

### Opportunity Types

- Research
- Startup
- Formal Internship

### Required Fields

- Organization / university
- Opportunity title or research focus
- Opportunity type
- Pipeline status

### Optional Fields

- Contact name
- Contact email
- Website
- Application URL
- Location
- Work arrangement (onsite, hybrid, remote, unspecified)
- Technical focus / tags
- Why this opportunity is relevant
- Personalization notes for outreach
- Priority (high, medium, low)
- Application deadline
- Next action
- Next action date
- General notes

### Pipeline Statuses

- Saved
- Researching
- Ready for Outreach
- Contacted / Applied
- Responded
- Meeting / Interview
- Offer
- Closed

For opportunities marked Closed, allow an outcome of rejected, withdrawn, or no longer pursuing.

The interface should use terminology appropriate to the opportunity type. For instance, a formal application is "Submitted," while a professor is "Contacted."

### Views

Provide:

- Table View: Sort and filter by status, type, priority, deadline, or last activity.
- Board View: Kanban-style columns organized by pipeline status.
- Detail View: Complete opportunity information, activity history, associated tasks, and next actions.

Users should be able to create, edit, archive, and delete opportunities.

Warn before destructive deletion.

## 6. Outreach and Activity Logging

Each opportunity should have a chronological activity log.

Supported activity types:

- Initial email sent
- Follow-up email sent
- Reply received
- Application submitted
- Meeting scheduled
- Meeting completed
- Interview completed
- Offer received
- Offer accepted
- Rejection received
- General note

Each activity stores:

- Associated opportunity
- Activity type
- Date/time
- Optional summary or notes
- Whether a reply was positive (explicitly selected, never inferred)

Logging an initial email should update the opportunity's stage to Contacted if appropriate.

After logging outreach, offer a suggested follow-up date seven days later, which the user can adjust.

Subsequent follow-up emails must not count as new initial outreach.

For recruiting statistics, count distinct opportunities contacted rather than the total number of emails sent.

All email activity is entered manually in the MVP.

For the local implementation, activity history is newest first. Activity times
are entered and displayed in America/New_York and stored in UTC. Nonexistent
spring daylight-saving times are rejected; repeated fall times use their earlier
occurrence. Follow-up suggestions use calendar days in New York.

Logging initial emails or applications advances early stages to Contacted /
Applied. Replies, meetings/interviews, and offers can advance their corresponding
stages. A rejection closes an open opportunity as rejected. Activity logging must
not regress later stages, reopen closed opportunities, or overwrite newer
pipeline information with backdated events.

Saving a suggested or adjusted follow-up date requires explicit selection and
sets the opportunity's Next action to Send follow-up email. Otherwise preserve
custom next actions. Sending a follow-up or logging a reply, meeting/interview,
offer, or rejection resolves an existing generated email reminder unless the event
predates the latest logged email. An explicitly selected replacement date takes
precedence. Closed opportunities must be reopened manually before a
follow-up can be scheduled. Deleting an opportunity deletes its linked activity
history, and the confirmation must explain this. Recruiting outreach counts use
distinct opportunities with initial emails; follow-ups alone do not count.

## 7. Goals and Milestones

Implement measurable goals with automatic progress tracking.

A goal contains:

- Title
- Metric
- Target quantity
- Start date
- Deadline
- Current progress
- Active/completed status

### Supported Metrics

- Distinct research contacts initially emailed
- Distinct startup contacts initially emailed
- Formal internship applications submitted
- Positive responses received
- Meetings or interviews completed
- Offers received
- Tasks completed
- Offers accepted

Progress should be derived from the activity log or completed tasks, avoiding duplicate counting.

In the local version, opportunity metrics count each opportunity once at its
earliest qualifying recorded milestone across all history. A repeated initial
email in a later week does not count as a new contact. Positive replies require an
explicit positive marker. Completed meetings/interviews, replies, and offers count
distinct opportunities. Received and accepted offers are separate milestones.
Task progress counts completed tasks, so reopening or deleting one changes progress.
Date ranges include both dates in New York time; future events do not count yet.
Weekly templates use Monday through Sunday. Goals persist Active or Paused state,
while completion is calculated from progress and target rather than manually set.

Goal start dates and deadlines define timeline block lengths; elapsed time must not increase measured goal progress.

### Initial Goal Templates

Provide editable starting targets:

| Goal | Target | Deadline |
| --- | --- | --- |
| Research outreach | 80 contacts | March 31, 2027 |
| Startup outreach | 50 contacts | March 31, 2027 |
| Formal applications | 10 submitted | March 31, 2027 |
| Secure a summer opportunity | 1 offer accepted | May 31, 2027 |

Also allow weekly goals, initially suggested as:

- 8 research contacts
- 5 startup contacts
- 2 formal applications

These are configurable targets, not mandatory fixed quotas.

Allow goals to be created, edited, paused, or deleted.

## 8. Task Management

Support standalone tasks and tasks associated with a specific opportunity.

Each task contains:

- Title
- Description (optional)
- Start date (optional)
- Due date
- Priority
- Category
- Associated opportunity (optional)
- Completion status

Task categories:

- Research
- Startup
- Applications
- Portfolio / Projects
- Administration

Features:

- Create, edit, complete, and delete tasks.
- Filter by category, priority, and completion status.
- Sort by due date.
- Display overdue tasks prominently.
- Link opportunity-specific tasks back to the relevant opportunity.

Include one-time milestones, such as completing a technical resume or deploying a portfolio project, as ordinary tasks with deadlines.

Completing a linked task clears a next action only when both its title and due
date match. Repeated completion requests preserve the original completion time.
Reopening a task removes its completion time without restoring old next actions.
Deleting an opportunity preserves linked tasks as standalone tasks. Task deletion
requires confirmation.

## 9. Unified Timeline

Provide one shared calendar/timeline for tasks and goals, using a Gantt-style layout.

### Layout and scale

- Place dates on the horizontal axis and tasks or goals in rows down the left.
- Render scheduled work as horizontal blocks spanning its start and end dates.
- Support day-by-day detail and broader week/month scales within the same view.
- Zooming changes the visible time scale while keeping the same underlying task and goal records.
- Allow the user to review the larger recruiting period and inspect individual days without maintaining separate calendars.

### Tasks and deadlines

- Use a task's optional start date and due date as the beginning and end of its block.
- Show tasks with only a due date as single-day deadline markers.
- Keep tasks without a complete scheduled range accessible in the Tasks list; do not invent missing dates.
- When both dates are provided, the start date must be on or before the due date.
- Selecting a task block or marker opens its task details for review or editing.

### Goals and progress

- Use each goal's existing start date and deadline as its block boundaries.
- Display measurable goal progress on the goal block or alongside its row.
- Block length represents the planned timeframe. Progress indicators represent progress calculated from logged activities or completed tasks.
- Do not treat elapsed time as goal completion.
- Selecting a goal opens its details.

Use the same task completion state, goal progress, and saved dates as the rest of the application. Keep daily placement consistent with the default America/New_York timezone and preserve date-only values as calendar dates.

## 10. Data Model

Use PostgreSQL with the following core tables.

### `opportunities`

- id UUID primary key
- user_id UUID
- type enum
- organization_name text
- title text
- contact_name text nullable
- contact_email text nullable
- website_url text nullable
- application_url text nullable
- location text nullable
- work_arrangement text nullable
- technical_focus text nullable
- fit_notes text nullable
- outreach_notes text nullable
- priority enum
- status enum
- closed_outcome enum nullable
- deadline date nullable
- next_action text nullable
- next_action_date date nullable
- notes text nullable
- created_at timestamp
- updated_at timestamp

### `activities`

- id UUID primary key
- user_id UUID
- opportunity_id UUID foreign key
- activity_type enum
- occurred_at timestamp
- notes text nullable
- created_at timestamp

### `tasks`

- id UUID primary key
- user_id UUID
- opportunity_id UUID nullable foreign key
- title text
- description text nullable
- category enum
- priority enum
- start_date date nullable
- due_date date nullable
- completed_at timestamp nullable
- created_at timestamp
- updated_at timestamp

### `goals`

- id UUID primary key
- user_id UUID
- title text
- metric_type enum
- target_count integer
- start_date date
- end_date date
- status enum
- created_at timestamp

Use database constraints and foreign keys where appropriate.

Enable Supabase Row Level Security for every user-owned table. All reads and writes must be restricted to the authenticated user.

Do not expose privileged database credentials to the client.

## 11. Search, Filtering, and Export

Provide global opportunity search across:

- Organization name
- Contact name
- Opportunity title
- Research or technical focus

Provide filters for opportunity type, pipeline status, priority, and upcoming deadlines.

Support exporting opportunities and activity records to CSV so the user retains ownership of their data.

CSV importing and bulk editing are optional later improvements.

## 12. Authentication and Settings

Use Supabase email authentication.

Keep the experience single-user focused; do not implement teams, invitations, or public profiles.

Settings should allow:

- Theme preference
- Default follow-up interval
- Editing initial recruiting goals
- CSV export
- Account sign-out

Use the America/New_York timezone for displaying and grouping dates by default. Store activity timestamps consistently in UTC.

## 13. Non-Goals for Version 1

Do not implement:

- Gmail integration
- Automatic email sending
- AI integrations, including AI-generated outreach
- Automated web scraping
- External API integrations beyond the specified stack
- Calendar synchronization
- Browser extensions
- Multi-user collaboration
- Complex analytics or predictive scoring
- Payment or subscription functionality

These features can be considered after the MVP is operational and being used regularly.

## 14. Required User Workflows

### Workflow A — Research outreach

1. Add a university professor as a research opportunity.
2. Record the professor's research focus and relevant publications.
3. Set the opportunity to Ready for Outreach.
4. Send an email externally.
5. Log the initial email.
6. Set a follow-up date.
7. Record any reply, conversation, or outcome.

### Workflow B — Startup internship

1. Add a startup.
2. Record contact information and relevant engineering work.
3. Set an outreach task and deadline.
4. Log the initial contact.
5. Record replies, meetings, interviews, and outcomes.

### Workflow C — Formal application

1. Add an internship with its application deadline.
2. Create any necessary preparation tasks.
3. Submit the application externally.
4. Log Application Submitted.
5. Track subsequent interview and offer stages.

### Workflow D — Weekly review

1. Open the dashboard.
2. Examine weekly goal progress.
3. Complete outstanding follow-ups.
4. Review upcoming application deadlines.
5. Create or update tasks for the next week.

## 15. MVP Acceptance Criteria

The MVP is complete when:

- A user can authenticate and securely access their data.
- Opportunities can be created, edited, viewed, filtered, and deleted.
- Outreach and applications can be logged against opportunities.
- An opportunity has a complete chronological activity history.
- Logging follow-ups does not inflate initial outreach counts.
- Goals automatically reflect recorded activity.
- Tasks can be created, completed, and linked to opportunities.
- Tasks and goals appear together on one timeline with dates on the horizontal axis.
- The same timeline supports daily detail and broader week/month scales.
- Task blocks span their start and due dates; due-date-only tasks appear as single-day markers.
- Goal blocks span their start dates and deadlines, with progress derived from recorded activity rather than elapsed time.
- Undated tasks remain accessible without fabricated schedule dates.
- The dashboard displays accurate metrics and actionable upcoming work.
- Overdue and upcoming deadlines are calculated correctly.
- Opportunity and activity data can be exported.
- The application is usable on desktop and mobile.
- Data persists correctly after refreshes and new sessions.

Test the core business logic, especially metric calculations, follow-up handling, status changes, date boundaries, and timeline ranges across day and month boundaries.

## 16. Development Phases

### Phase 1 — Functional Core

- Initialize Next.js, Tailwind, and shadcn/ui.
- Configure Supabase and authentication.
- Create database schema and RLS policies.
- Implement opportunity CRUD.
- Implement activity logging.
- Build a functional dashboard with basic statistics.

### Phase 2 — Execution Tools

- Implement task management.
- Implement measurable goals.
- Implement the unified task and goal timeline with daily and broader week/month scales.
- Implement action queue and deadline logic.
- Add search and filtering.
- Add CSV export.

### Phase 3 — Interface Refinement and Deployment

- Add Kanban view.
- Improve responsive layouts, including readable timeline access on mobile.
- Implement loading, empty, validation, and error states.
- Add automated tests for essential logic.
- Deploy to Vercel.
- Verify key workflows in production.

Keep the phases independently usable. Do not spend time polishing advanced visuals before the core workflows work.

## 17. Design Philosophy

The most important feature is the action queue.

This is not simply an application for recording how many emails have been sent. It should actively help the user decide what needs to happen next.

Favor:

- Clear actions over decorative statistics.
- Real outcomes over arbitrary activity counts.
- Fast data entry over complicated workflows.
- Accurate records over optimistic progress reporting.
- Reliable functionality over unnecessary features.

Final product objective: A fast, practical personal tool that makes research outreach, startup recruiting, formal applications, and technical preparation easier to manage throughout the summer 2027 recruiting process.
