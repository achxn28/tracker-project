"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearNextAction, setTaskCompleted } from "@/app/tasks/actions";
import type { QueueItem } from "@/lib/action-queue";

export function QueueControls({ item }: { item: QueueItem }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  if (item.kind !== "task" && item.kind !== "next_action") return null;
  return <div className="space-y-2"><button className="tracker-button" disabled={pending} aria-label={item.kind === "task" ? `Complete task: ${item.title}` : `Clear next action: ${item.title} for ${item.context}`} onClick={() => startTransition(async () => {
    try {
      const result = item.kind === "task" ? await setTaskCompleted(item.id, true) : await clearNextAction(item.id, item.title, item.date!);
      if (result.message) { setMessage(result.message); return; }
      setMessage(""); router.refresh();
    } catch { setMessage("Couldn’t update this item. Please try again."); }
  })}>{pending ? "Saving…" : item.kind === "task" ? "Complete" : "Clear action"}</button>
    {message && <p role="alert" className="max-w-xs text-sm text-destructive">{message}</p>}
  </div>;
}
