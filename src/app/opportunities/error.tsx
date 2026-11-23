"use client";

export default function OpportunitiesError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Couldn’t load opportunities</h1><p>Please try again. Check that the local data folder is writable if the issue continues.</p><button className="tracker-button" onClick={reset}>Try again</button></main>;
}
