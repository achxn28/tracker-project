# Summer 2027 Opportunity Tracker

Product Requirements Specification — Version 1.1

### Current implementation direction — November 22, 2026

The application is now intended for use only on the owner's computer. Use a local
SQLite database, bind the app server to `127.0.0.1`, and omit authentication.
This decision supersedes the Supabase, user-account/RLS, and Vercel hosting
requirements below for the local version. User ownership columns are unnecessary
in the local database. Keep the remaining product workflows and timeline scope.
Implemented milestones cover opportunity creation, listing, viewing, editing,
deletion, and manual activity logging; the other workflows remain future work.

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
- Rejection received
- General note

Each activity stores:

- Associated opportunity
- Activity type
- Date/time
- Optional summary or notes

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
sets the opportunity's Next action to Send follow-up email. Otherwise preserve the
existing next action. Closed opportunities must be reopened manually before a
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

Progress should be derived from the activity log or completed tasks, avoiding duplicate counting.

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
