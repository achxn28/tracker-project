"use client";

import { useActionState, type ReactNode } from "react";
import { updateGmailReview } from "@/app/research/gmail/actions";

export function GmailReviewForm({ children }: { children: ReactNode }) {
  const [feedback, action, pending] = useActionState(updateGmailReview, {});
  return <form action={action} className="space-y-2">
    <fieldset disabled={pending} className="flex flex-wrap items-end gap-2">{children}</fieldset>
    {(pending || feedback.message) && <p role={feedback.error && !pending ? "alert" : "status"} className={`text-sm ${feedback.error && !pending ? "text-destructive" : "text-muted-foreground"}`}>
      {pending ? "Working…" : feedback.message}
    </p>}
  </form>;
}
