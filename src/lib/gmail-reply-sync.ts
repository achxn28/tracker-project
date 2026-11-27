import "server-only";
import { createGmailReplyMatcher, isOpenResearchOpportunity, type GmailReplyContext } from "./gmail-reply-matcher.ts";
import { gmailReplyHeaders, normalizeGmailAddress, type GmailMessageMetadata } from "./gmail-reply-metadata.ts";

const api = "https://gmail.googleapis.com/gmail/v1/users/me";
export const gmailScanDays = 30;
const maxContacts = 100;
const maxThreads = 40;
const idPattern = /^[\w-]{1,180}$/;
const messageIdPattern = /^<[^<>@\s"]+@[^<>@\s"]+>$/;

function gmailGet(accessToken: string, fetcher: typeof fetch, signal: AbortSignal) {
  return async (path: string, query: URLSearchParams) => {
    const response = await fetcher(`${api}/${path}?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error", cache: "no-store", signal,
    });
    if (response.status === 401 || response.status === 403) throw new Error("Gmail access was refused. Check the Gmail API setup or reconnect Gmail.");
    if (response.status === 429) throw new Error("Gmail is limiting requests. Try the check again later.");
    if (response.status === 404 && path.startsWith("threads/")) return null;
    if (!response.ok) throw new Error("Gmail could not complete the check. Try again.");
    return response.json();
  };
}

const threadQuery = () => {
  const query = new URLSearchParams({ format: "metadata", fields: "id,messages(id,threadId,internalDate,labelIds,payload(headers))" });
  for (const name of [...gmailReplyHeaders, "Message-ID"]) query.append("metadataHeaders", name);
  return query;
};

type MessagePointer = { id: string; threadId: string };
function listedMessages(value: { messages?: MessagePointer[] }): MessagePointer[] {
  return Array.isArray(value.messages) ? value.messages.filter(item => idPattern.test(item.id) && idPattern.test(item.threadId)) : [];
}

function sentReferences(message: GmailMessageMetadata, thread: GmailMessageMetadata[]) {
  const refs = message.payload?.headers?.filter(header => ["in-reply-to", "references"].includes(header.name.toLowerCase()))
    .flatMap(header => header.value.trim().split(/\s+/)) ?? [];
  return thread.some(previous => previous.labelIds?.includes("SENT") &&
    Number(previous.internalDate) < Number(message.internalDate) &&
    previous.payload?.headers?.some(header => header.name.toLowerCase() === "message-id" && refs.includes(header.value.trim())));
}

export async function scanGmailReplies(
  accessToken: string, context: GmailReplyContext, fetcher: typeof fetch = fetch, now = Date.now(),
) {
  const get = gmailGet(accessToken, fetcher, AbortSignal.timeout(25000));
  const eligible = context.opportunities.filter(isOpenResearchOpportunity);
  const eligibleIds = new Set(eligible.map(item => item.id));
  const contacts = [...new Set(eligible.flatMap(item => item.contact_email ? [normalizeGmailAddress(item.contact_email)] : []).filter(Boolean))];
  const linked = new Set(context.threadLinks.filter(link => link.mailboxId === context.mailboxId && eligibleIds.has(link.opportunityId))
    .map(link => link.threadId).filter(id => idPattern.test(id)));
  const selected = new Map([...linked].slice(0, maxThreads).map(id => [id, new Set<string>()]));
  const cutoff = Math.floor(now / 1000) - gmailScanDays * 86400;
  let limited = contacts.length > maxContacts || linked.size > maxThreads;

  for (let offset = 0; offset < Math.min(maxContacts, contacts.length) && selected.size < maxThreads; offset += 20) {
    const senders = contacts.slice(offset, offset + 20).map(address => `from:"${address}"`).join(" ");
    const page = await get("messages", new URLSearchParams({
      q: `after:${cutoff} -in:sent -in:drafts {${senders}}`,
      maxResults: "100", fields: "nextPageToken,messages(id,threadId)",
    }));
    limited ||= Boolean(page.nextPageToken);
    for (const message of listedMessages(page)) {
      if (!selected.has(message.threadId)) {
        if (selected.size >= maxThreads) { limited = true; continue; }
        selected.set(message.threadId, new Set());
      }
      selected.get(message.threadId)!.add(message.id);
    }
  }
  if (selected.size === maxThreads) limited = true;

  const match = createGmailReplyMatcher(context);
  const replies: GmailMessageMetadata[] = [];
  const threadIds = [...selected.keys()];
  for (let offset = 0; offset < threadIds.length; offset += 5) {
    const batch = await Promise.all(threadIds.slice(offset, offset + 5).map(async id => {
      const value = await get(`threads/${encodeURIComponent(id)}`, threadQuery());
      const messages: GmailMessageMetadata[] = Array.isArray(value?.messages) ? value.messages : [];
      return messages.filter(message =>
        message.threadId === id && Number(message.internalDate) >= cutoff * 1000 &&
        !!message.id && (linked.has(id) || selected.get(id)!.has(message.id)) &&
        match(message) && (linked.has(id) || sentReferences(message, messages)),
      );
    }));
    replies.push(...batch.flat());
  }
  return { replies, limited };
}

export async function resolveGmailThread(accessToken: string, input: string, fetcher: typeof fetch = fetch) {
  const get = gmailGet(accessToken, fetcher, AbortSignal.timeout(15000));
  const value = input.trim();
  if (messageIdPattern.test(value)) {
    const page = await get("messages", new URLSearchParams({
      q: `rfc822msgid:${value.slice(1, -1)}`, maxResults: "2", fields: "nextPageToken,messages(id,threadId)",
    }));
    const messages = listedMessages(page);
    if (messages.length === 1 && !page.nextPageToken) return messages[0].threadId;
    throw new Error("Gmail could not find one message with that Message-ID.");
  }
  let id = value;
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (url.origin !== "https://mail.google.com" || !url.pathname.startsWith("/mail/")) throw new Error("Use a Gmail conversation link.");
    id = url.hash.split("/").at(-1) ?? "";
  }
  if (!idPattern.test(id)) throw new Error("Enter a Gmail conversation link or a Message-ID from Show original.");
  const thread = await get(`threads/${encodeURIComponent(id)}`, new URLSearchParams({ format: "minimal", fields: "id" }));
  if (thread?.id !== id) throw new Error("Gmail could not open that link. Copy the Message-ID from Show original instead.");
  return id;
}

export function gmailConversationHref(email: string, threadId: string) {
  return `https://mail.google.com/mail/u/${encodeURIComponent(email)}/#all/${encodeURIComponent(threadId)}`;
}
