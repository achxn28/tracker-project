export const gmailReplyHeaders = ["From", "In-Reply-To", "References", "Auto-Submitted", "List-Id"] as const;

export type GmailMessageMetadata = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: readonly string[];
  payload?: { headers?: readonly { name: string; value: string }[] };
};

export type GmailReplyMetadata = {
  messageId: string;
  threadId: string;
  sender: string;
  receivedAt: string;
};

const address = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

export function normalizeGmailAddress(value: string): string | null {
  const trimmed = value.trim();
  return address.test(trimmed) ? trimmed.toLowerCase() : null;
}

function senderAddress(value: string) {
  const header = value.replace(/\r?\n[ \t]+/g, " ").trim();
  if (/[\r\n]/.test(header)) return null;
  const direct = normalizeGmailAddress(header);
  if (direct) return direct;

  const named = /^(.*)<([^<>]+)>$/.exec(header);
  if (!named) return null;
  const display = named[1].trim();
  // A display name can include commas or address-like text when quoted.
  // Reject groups and lists instead of guessing which sender to use.
  if (display && !/^[^"<>(),:;@\\]+$/.test(display) && !/^"(?:[^"\\]|\\.)*"$/.test(display)) return null;
  return normalizeGmailAddress(named[2]);
}

function hasReplyReference(headers: Map<string, string[]>) {
  return ["in-reply-to", "references"].some(name => {
    const values = headers.get(name);
    return values?.length === 1 && values[0].trim().split(/\s+/).every(value => /^<[^<>@\s]+@[^<>@\s]+>$/.test(value));
  });
}

const skippedLabels = new Set(["SENT", "DRAFT", "SPAM", "TRASH"]);

export function parseGmailReplyMetadata(message: GmailMessageMetadata): GmailReplyMetadata | null {
  if (!message.id?.trim() || !message.threadId?.trim() || !message.internalDate || !/^\d+$/.test(message.internalDate)) return null;
  if (message.labelIds?.some(label => skippedLabels.has(label))) return null;
  const received = new Date(Number(message.internalDate));
  if (!Number.isFinite(received.getTime())) return null;

  const headers = new Map<string, string[]>();
  for (const { name, value } of message.payload?.headers ?? []) {
    const key = name.toLowerCase();
    const values = headers.get(key);
    if (values) values.push(value);
    else headers.set(key, [value]);
  }
  const from = headers.get("from");
  if (from?.length !== 1 || headers.has("list-id") || !hasReplyReference(headers)) return null;
  const autoSubmitted = headers.get("auto-submitted");
  if (autoSubmitted && (autoSubmitted.length !== 1 || autoSubmitted[0].split(";")[0].trim().toLowerCase() !== "no")) return null;
  const sender = senderAddress(from[0]);
  return sender ? { messageId: message.id, threadId: message.threadId, sender, receivedAt: received.toISOString() } : null;
}
