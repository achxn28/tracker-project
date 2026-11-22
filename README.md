# Summer 2027 Opportunity Tracker

The framework foundation for a personal research outreach and internship tracker.
Product requirements are documented in [specs.md](specs.md).

## Stack

- Next.js App Router and React
- TypeScript
- Tailwind CSS and shadcn/ui
- Lucide icons

## Local development

Use Node.js 20.9 or later and npm.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The homepage lives in
`src/app/page.tsx`, with the root layout and global styles in `src/app`.

## Checks and production build

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

`typecheck` generates Next.js route types before checking TypeScript. `npm start`
serves the production build after `npm run build` succeeds.

The current scaffold includes a minimal homepage and one shadcn/ui Card component.
Database setup, authentication, and recruiting features are subsequent steps.
