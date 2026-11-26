# Open Tracker on macOS

Open `Tracker.app` in Finder like any other Mac app. You can keep it in the Dock
for one-click access. The launcher uses the current tracker checkout, including
its installed dependencies, production build, and ignored local settings. Your
Supabase configuration, Google authorization, and local files stay in the
checkout.

Tracker opens in a compact, rounded window. The glass uses macOS's own
window backdrop and does not request Screen Recording. If macOS asks for
Desktop folder access, it is because the checkout is on Desktop. macOS
manages that permission, and locally signed development builds can ask again
after an update.

## Build the launcher

Use Node.js 24 or later and the macOS Command Line Tools. From the repository:

```sh
npm ci
npm run build
npm run desktop:build
```

The last command generates `build/Tracker.app`, which is ignored by Git. You
can open it there or copy it to your Applications folder. The app records the
absolute checkout and Node paths at build time. Rebuild it if you move the
checkout or replace the Node installation. Quit Tracker before rebuilding
the Next.js production files after an update.

## Launch and quit

- Tracker uses the existing localhost port 3000. If a Next.js server is
  already listening on that port from this checkout, Tracker adopts it.
- Closing the window or pressing **Command-Q** stops the server Tracker
  started or adopted. If the port belongs to another app, Tracker shows a
  conflict message and leaves that process alone.
- **Connect Gmail** and **Connect Google** open your default browser for
  authorization. Return to Tracker when Google is finished. CSV exports also
  use the browser's download handling.

For local launcher testing, set `TRACKER_LAUNCHER_PORT` when running
`npm run desktop:build`. Google authorization callbacks use their configured
port, so keep port 3000 for the normal launcher unless you also update the
OAuth configuration.
