import { normalizeGmailAddress, parseGmailReplyMetadata, type GmailMessageMetadata, type GmailReplyMetadata } from "./gmail-reply-metadata.ts";
import type { Opportunity } from "./opportunity-model.ts";

export type GmailTrackedOpportunity = Pick<Opportunity, "id" | "type" | "status" | "contact_email" | "archived_at">;
export type GmailThreadLink = { mailboxId: string; threadId: string; opportunityId: string };
export type GmailReplyContext = {
  mailboxId: string;
  ownAddresses: readonly string[];
  opportunities: readonly GmailTrackedOpportunity[];
  threadLinks: readonly GmailThreadLink[];
};

type GmailReplySource = GmailReplyMetadata & { mailboxId: string };

export type GmailReplyCandidate = GmailReplySource & (
  | { state: "matched"; matchedBy: "thread" | "contact"; opportunityId: string }
  | { state: "needs-review"; reason: "shared-contact" | "conflicting-thread-links" | "unexpected-thread-sender"; opportunityIds: string[] }
);

export function isOpenResearchOpportunity(opportunity: GmailTrackedOpportunity) {
  return opportunity.type === "Research" && !opportunity.archived_at && opportunity.status !== "Closed";
}

export function createGmailReplyMatcher(context: GmailReplyContext) {
  const ownAddresses = new Set(context.ownAddresses.map(normalizeGmailAddress));
  const active = new Map<string, string | null>();
  const contacts = new Map<string, Set<string>>();
  const links = new Map<string, Set<string>>();

  function add(index: Map<string, Set<string>>, key: string, opportunityId: string) {
    const ids = index.get(key);
    if (ids) ids.add(opportunityId);
    else index.set(key, new Set([opportunityId]));
  }

  for (const opportunity of context.opportunities) {
    if (!isOpenResearchOpportunity(opportunity)) continue;
    const address = opportunity.contact_email ? normalizeGmailAddress(opportunity.contact_email) : null;
    active.set(opportunity.id, address);
    if (address) add(contacts, address, opportunity.id);
  }
  for (const link of context.threadLinks) {
    if (link.mailboxId === context.mailboxId) add(links, link.threadId, link.opportunityId);
  }

  return function match(message: GmailMessageMetadata): GmailReplyCandidate | null {
    const reply = parseGmailReplyMetadata(message);
    if (!reply || ownAddresses.has(reply.sender)) return null;

    const source = { ...reply, mailboxId: context.mailboxId };
    const linked = links.get(reply.threadId);
    const contactIds = [...(contacts.get(reply.sender) ?? [])].sort();
    if (linked) {
      const eligibleIds = [...linked].filter(id => active.has(id)).sort();
      if (eligibleIds.length === 0) return null;
      if (linked.size > 1) return { ...source, state: "needs-review", reason: "conflicting-thread-links", opportunityIds: eligibleIds };

      const opportunityId = eligibleIds[0];
      if (active.get(opportunityId) !== reply.sender) {
        return {
          ...source, state: "needs-review", reason: "unexpected-thread-sender",
          opportunityIds: [opportunityId, ...contactIds],
        };
      }
      return { ...source, state: "matched", matchedBy: "thread", opportunityId };
    }

    if (contactIds.length === 1) return { ...source, state: "matched", matchedBy: "contact", opportunityId: contactIds[0] };
    if (contactIds.length > 1) return { ...source, state: "needs-review", reason: "shared-contact", opportunityIds: contactIds };
    return null;
  };
}

type GmailReplyIdentity = Pick<GmailReplySource, "mailboxId" | "messageId">;

export function collectGmailReplyCandidates(
  context: GmailReplyContext,
  messages: readonly GmailMessageMetadata[],
  knownSources: Iterable<GmailReplyIdentity> = [],
): GmailReplyCandidate[] {
  const keyOf = ({ mailboxId, messageId }: GmailReplyIdentity) => JSON.stringify([mailboxId, messageId]);
  const seen = new Set<string>();
  for (const source of knownSources) seen.add(keyOf(source));

  const match = createGmailReplyMatcher(context);
  const results: GmailReplyCandidate[] = [];
  for (const message of messages) {
    const candidate = match(message);
    if (!candidate) continue;
    const key = keyOf(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(candidate);
  }
  return results;
}
