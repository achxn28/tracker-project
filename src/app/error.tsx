"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Couldn’t load your workspace</h1><p>Please check that the local data folder is writable and try again.</p><button className="tracker-button" onClick={reset}>Try again</button></main>;
}
