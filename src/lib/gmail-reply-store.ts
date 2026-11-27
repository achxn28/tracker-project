import "server-only";
import { closeSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GmailConfig } from "./gmail-connection.ts";
import { decryptGmailData, encryptGmailData, gmailLocalIdentifier } from "./gmail-local-data.ts";
import { collectGmailReplyCandidates, type GmailReplyCandidate, type GmailReplyContext, type GmailThreadLink } from "./gmail-reply-matcher.ts";
import type { GmailMessageMetadata } from "./gmail-reply-metadata.ts";

export type GmailReviewState =
  | { state: "pending" | "dismissed" }
  | { state: "applying" | "approved"; opportunityId: string };

export function openGmailReplyStore(config: Pick<GmailConfig, "tokenPath" | "encryptionKey">) {
  const directory = dirname(config.tokenPath);
  const filename = join(directory, "replies.sqlite");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    closeSync(openSync(filename, "wx", 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const file = lstatSync(filename);
  if (!file.isFile() || (file.mode & 0o077) !== 0) throw new Error("The local Gmail reply database must be private.");

  const db = new DatabaseSync(filename);
  try {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS reply_candidates (
        mailbox_key TEXT NOT NULL,
        message_key TEXT NOT NULL,
        payload BLOB NOT NULL,
        PRIMARY KEY (mailbox_key, message_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS reply_reviews (
        mailbox_key TEXT NOT NULL,
        message_key TEXT NOT NULL,
        payload BLOB NOT NULL,
        PRIMARY KEY (mailbox_key, message_key),
        FOREIGN KEY (mailbox_key, message_key) REFERENCES reply_candidates(mailbox_key, message_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS thread_links (
        mailbox_key TEXT NOT NULL,
        link_key TEXT NOT NULL,
        payload BLOB NOT NULL,
        PRIMARY KEY (mailbox_key, link_key)
      ) STRICT;
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  const { encryptionKey } = config;
  const mailboxKey = (mailboxId: string) => gmailLocalIdentifier(encryptionKey, "mailbox", mailboxId);
  const messageKey = (messageId: string) => gmailLocalIdentifier(encryptionKey, "message", messageId);
  const decode = <T>(value: unknown): T => JSON.parse(decryptGmailData(encryptionKey, "candidate", value as Uint8Array)) as T;
  const encode = (value: unknown) => encryptGmailData(encryptionKey, "candidate", JSON.stringify(value));
  const reviewState = (payload: unknown): GmailReviewState => payload ? decode<GmailReviewState>(payload) : { state: "pending" };

  const reviewRows = `SELECT candidate.payload AS candidate, review.payload AS review
    FROM reply_candidates candidate LEFT JOIN reply_reviews review USING (mailbox_key, message_key)
    WHERE candidate.mailbox_key = ?`;
  function getReview(mailbox: string, message: string) {
    const row = db.prepare(`${reviewRows} AND candidate.message_key = ?`).get(mailbox, message);
    return row ? { candidate: decode<GmailReplyCandidate>(row.candidate), review: reviewState(row.review) } : null;
  }

  function changeReview(mailboxId: string, messageId: string, transition: (entry: NonNullable<ReturnType<typeof getReview>>) => GmailReviewState) {
    const mailbox = mailboxKey(mailboxId);
    const message = messageKey(messageId);
    db.exec("BEGIN IMMEDIATE");
    try {
      const entry = getReview(mailbox, message);
      if (!entry) throw new Error("That Gmail reply is no longer available.");
      const review = transition(entry);
      db.prepare(`INSERT INTO reply_reviews VALUES (?, ?, ?) ON CONFLICT (mailbox_key, message_key)
        DO UPDATE SET payload = excluded.payload`).run(mailbox, message, encode(review));
      db.exec("COMMIT");
      return { candidate: entry.candidate, review };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    collect(context: GmailReplyContext, messages: readonly GmailMessageMetadata[]): GmailReplyCandidate[] {
      const candidates = collectGmailReplyCandidates(context, messages);
      if (candidates.length === 0) return [];
      const mailbox = mailboxKey(context.mailboxId);
      const insert = db.prepare(`INSERT INTO reply_candidates (mailbox_key, message_key, payload) VALUES (?, ?, ?)
        ON CONFLICT (mailbox_key, message_key) DO NOTHING`);
      // Save the source and the candidate in the same row so a retry never
      // skips a source whose review candidate was lost before it was saved.
      db.exec("BEGIN IMMEDIATE");
      try {
        const saved = candidates.filter(candidate => {
          const key = messageKey(candidate.messageId);
          const payload = encode(candidate);
          return insert.run(mailbox, key, payload).changes === 1;
        });
        db.exec("COMMIT");
        return saved;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    candidates(mailboxId: string): GmailReplyCandidate[] {
      return db.prepare("SELECT payload FROM reply_candidates WHERE mailbox_key = ? ORDER BY rowid")
        .all(mailboxKey(mailboxId))
        .map(row => decode<GmailReplyCandidate>(row.payload));
    },
    review(mailboxId: string, messageId: string) {
      return getReview(mailboxKey(mailboxId), messageKey(messageId));
    },
    reviews(mailboxId: string) {
      return db.prepare(reviewRows).all(mailboxKey(mailboxId))
        .map(row => ({ candidate: decode<GmailReplyCandidate>(row.candidate), review: reviewState(row.review) }))
        .sort((a, b) => b.candidate.receivedAt.localeCompare(a.candidate.receivedAt));
    },
    beginApproval(mailboxId: string, messageId: string, opportunityId: string) {
      return changeReview(mailboxId, messageId, ({ candidate, review }) => {
        const choices = candidate.state === "matched" ? [candidate.opportunityId] : candidate.opportunityIds;
        if (!choices.includes(opportunityId)) throw new Error("Choose one of the matched research contacts.");
        if (review.state === "pending") return { state: "applying", opportunityId };
        if ((review.state === "applying" || review.state === "approved") && review.opportunityId === opportunityId) return review;
        throw new Error("This reply already has a review decision.");
      });
    },
    finishApproval(mailboxId: string, messageId: string, opportunityId: string) {
      changeReview(mailboxId, messageId, ({ review }) => {
        if ((review.state === "applying" || review.state === "approved") && review.opportunityId === opportunityId) {
          return { state: "approved", opportunityId };
        }
        throw new Error("This reply has a different review decision.");
      });
    },
    dismiss(mailboxId: string, messageId: string) {
      changeReview(mailboxId, messageId, ({ review }) => {
        if (review.state !== "pending" && review.state !== "dismissed") throw new Error("An approval is already recorded or in progress.");
        return { state: "dismissed" };
      });
    },
    links(mailboxId: string) {
      return db.prepare("SELECT link_key, payload FROM thread_links WHERE mailbox_key = ? ORDER BY rowid")
        .all(mailboxKey(mailboxId))
        .map(row => ({ key: row.link_key as string, ...decode<GmailThreadLink>(row.payload) }));
    },
    link(link: GmailThreadLink) {
      const key = messageKey(JSON.stringify(["thread", link.threadId, link.opportunityId]));
      db.prepare("INSERT INTO thread_links VALUES (?, ?, ?) ON CONFLICT (mailbox_key, link_key) DO NOTHING")
        .run(mailboxKey(link.mailboxId), key, encode(link));
    },
    unlink(mailboxId: string, key: string) {
      db.prepare("DELETE FROM thread_links WHERE mailbox_key = ? AND link_key = ?").run(mailboxKey(mailboxId), key);
    },
    close() { db.close(); },
  };
}
