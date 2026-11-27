import Link from "next/link";
import { OllamaTaskPilot } from "@/components/ollama-task-pilot";
import { TrackerHeader } from "@/components/tracker-header";
import { todayInNewYork } from "@/lib/action-queue";
import { ollamaTaskSamples } from "@/lib/ollama-task-samples";

export const dynamic = "force-dynamic";

export default function SampleSuggestionsPage() {
  return <div className="min-h-svh">
    <TrackerHeader active="research" />
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <Link href="/research/gmail" className="text-sm text-primary underline-offset-4 hover:underline">Gmail review</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Try task suggestions</h1>
        <p className="mt-2 text-muted-foreground">Use a sample email to try Ollama on this Mac. Approval adds the sample task to your workspace.</p>
      </header>
      <OllamaTaskPilot samples={ollamaTaskSamples(todayInNewYork())} />
    </main>
  </div>;
}
