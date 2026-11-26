import "server-only";
import { closeSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GmailConfig } from "./gmail-connection.ts";
import { decryptGmailData, encryptGmailData, gmailLocalIdentifier } from "./gmail-local-data.ts";
import { collectGmailReplyCandidates, type GmailReplyCandidate, type GmailReplyContext } from "./gmail-reply-matcher.ts";
import type { GmailMessageMetadata } from "./gmail-reply-metadata.ts";

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
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  const { encryptionKey } = config;
  const mailboxKey = (mailboxId: string) => gmailLocalIdentifier(encryptionKey, "mailbox", mailboxId);

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
          const key = gmailLocalIdentifier(encryptionKey, "message", candidate.messageId);
          const payload = encryptGmailData(encryptionKey, "candidate", JSON.stringify(candidate));
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
        .map(row => JSON.parse(decryptGmailData(encryptionKey, "candidate", row.payload as Uint8Array)) as GmailReplyCandidate);
    },
    close() { db.close(); },
  };
}
