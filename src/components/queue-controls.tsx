"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markSupplementDone } from "@/app/admissions/actions";
import { clearNextAction, setTaskCompleted } from "@/app/tasks/actions";
import type { QueueItem } from "@/lib/action-queue";

export function QueueControls({ item }: { item: Pick<QueueItem, "kind" | "id" | "title" | "date" | "context"> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  if (item.kind !== "task" && item.kind !== "supplement" && item.kind !== "next_action") return null;
  return <div className="space-y-2"><button className="tracker-button" disabled={pending} aria-label={item.kind === "next_action" ? `Clear next action: ${item.title} for ${item.context}` : `Complete ${item.kind}: ${item.title}`} onClick={() => startTransition(async () => {
    try {
      const result = item.kind === "supplement"
        ? await markSupplementDone(item.id)
        : item.kind === "task"
          ? await setTaskCompleted(item.id, true)
          : await clearNextAction(item.id, item.title, item.date!);
      if (result.message) { setMessage(result.message); return; }
      setMessage(""); router.refresh();
    } catch { setMessage("Couldn’t update this item. Please try again."); }
  })}>{pending ? "Saving…" : item.kind === "next_action" ? "Clear action" : "Complete"}</button>
    {message && <p role="alert" className="max-w-xs text-sm text-destructive">{message}</p>}
  </div>;
}
