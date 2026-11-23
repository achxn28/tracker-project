# Summer 2027 Opportunity Tracker

A local personal research outreach and internship tracker with opportunity creation,
viewing, editing, and deletion.
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

Tests use disposable databases and check validation, CRUD, and persistence across
a separate Node.js process. They do not touch your saved opportunities.

Activity logging, tasks, goals, and the timeline are later milestones.
