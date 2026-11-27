"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { gmailConfig, gmailConnection } from "@/lib/gmail-connection";
import { gmailLocalIdentifier } from "@/lib/gmail-local-data";
import { isOpenResearchOpportunity } from "@/lib/gmail-reply-matcher";
import { openGmailReplyStore } from "@/lib/gmail-reply-store";
import { gmailScanDays, resolveGmailThread, scanGmailReplies } from "@/lib/gmail-reply-sync";
import { withTrackerStore } from "@/lib/tracker-store";

export type ReviewFeedback = { message?: string; error?: boolean };

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateGmailReview(_: ReviewFeedback, form: FormData): Promise<ReviewFeedback> {
  try {
    const config = gmailConfig();
    if (!config) throw new Error("Set up Gmail in Settings before checking for replies.");
    const { port } = new URL(config.redirectUri);
    const host = (await headers()).get("host")?.toLowerCase();
    if (!["127.0.0.1", "localhost"].some(name => host === (port ? `${name}:${port}` : name))) {
      throw new Error("Open the local Tracker app to review Gmail.");
    }

    const connection = gmailConnection(config);
    const mailbox = connection.mailbox();
    if (!mailbox) throw new Error("Connect Gmail in Settings first.");
    const { mailboxId } = mailbox;
    const store = openGmailReplyStore(config);
    try {
      async function access() {
        const current = await connection.access();
        if (current.mailboxId !== mailboxId) throw new Error("The Gmail connection changed. Try again.");
        return current.accessToken;
      }
      function ensureMailbox() {
        if (connection.mailbox()?.mailboxId !== mailboxId) throw new Error("The Gmail connection changed. Try again.");
      }

      let message: string;
      const opportunityId = field(form, "opportunity");
      const messageId = field(form, "message");
      switch (field(form, "operation")) {
        case "check": {
          const opportunities = await withTrackerStore(tracker => tracker.list());
          const context = { mailboxId, ownAddresses: [mailbox.email], opportunities, threadLinks: store.links(mailboxId) };
          let result;
          try {
            result = await scanGmailReplies(await access(), context);
          } catch (error) {
            if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
              throw new Error("The Gmail check timed out. No replies were added. Try again.");
            }
            throw error;
          }
          ensureMailbox();
          const added = store.collect(context, result.replies).length;
          message = `${added === 0 ? "No new replies found" : `${added} new ${added === 1 ? "reply" : "replies"} to review`} in the last ${gmailScanDays} days.`;
          if (result.limited) message += " The scan reached its limit, so some recent messages may be outside this check.";
          break;
        }
        case "link": {
          const opportunity = await withTrackerStore(tracker => tracker.get(opportunityId));
          if (!opportunity || !isOpenResearchOpportunity(opportunity)) throw new Error("Choose an open research opportunity.");
          const source = field(form, "thread");
          if (source.length > 600) throw new Error("Enter a Gmail conversation link or Message-ID.");
          const threadId = await resolveGmailThread(await access(), source);
          ensureMailbox();
          store.link({ mailboxId, threadId, opportunityId });
          message = "Gmail conversation linked.";
          break;
        }
        case "unlink":
          store.unlink(mailboxId, field(form, "link"));
          message = "Conversation link removed.";
          break;
        case "dismiss":
          store.dismiss(mailboxId, messageId);
          message = "Reply dismissed.";
          break;
        case "approve": {
          if (store.review(mailboxId, messageId)?.review.state === "pending") {
            const opportunity = await withTrackerStore(tracker => tracker.get(opportunityId));
            if (!opportunity || !isOpenResearchOpportunity(opportunity)) throw new Error("Choose an open research opportunity.");
          }
          ensureMailbox();
          const { candidate, review } = store.beginApproval(mailboxId, messageId, opportunityId);
          if (review.state !== "approved") {
            const key = gmailLocalIdentifier(config.encryptionKey, "message", JSON.stringify([mailboxId, candidate.messageId]));
            try {
              await withTrackerStore(tracker => tracker.logActivity(opportunityId, {
                activity_type: "Reply received", occurred_at: candidate.receivedAt,
                notes: "Approved in Gmail review.", follow_up_date: null,
              }, `gmail-${key}`));
            } catch {
              throw new Error("Tracker could not confirm the activity was saved. Retry approval to finish without duplicating it.");
            }
            store.finishApproval(mailboxId, messageId, opportunityId);
            for (const path of ["/", "/goals", "/opportunities", "/research", "/timeline"]) revalidatePath(path);
          }
          message = "Reply approved and recorded.";
          break;
        }
        default:
          throw new Error("Choose a Gmail review action.");
      }
      revalidatePath("/research/gmail");
      return { message };
    } finally {
      store.close();
    }
  } catch (error) {
    revalidatePath("/research/gmail");
    return { error: true, message: error instanceof Error ? error.message : "Gmail review could not be updated." };
  }
}
