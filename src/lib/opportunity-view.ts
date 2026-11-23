import { statuses, priorities, opportunityTypes, type Opportunity } from "./opportunity-model.ts";
import { addCalendarDays } from "./action-queue.ts";

export type OpportunityFilters = { search: string; type: string; status: string; priority: string; deadline: string; archive: string; sort: string };
export const defaultOpportunityFilters: OpportunityFilters = { search: "", type: "", status: "", priority: "", deadline: "", archive: "active", sort: "newest" };

export function selectOpportunities(opportunities: Opportunity[], filters: OpportunityFilters, today: string, lastActivity: Record<string, string> = {}) {
  const search = filters.search.trim().toLocaleLowerCase();
  const end = addCalendarDays(today, 7);
  return opportunities.filter(item => {
    if (filters.archive === "active" && item.archived_at || filters.archive === "archived" && !item.archived_at) return false;
    if (filters.type && item.type !== filters.type || filters.status && item.status !== filters.status || filters.priority && item.priority !== filters.priority) return false;
    if (search && ![item.organization_name, item.contact_name, item.title, item.technical_focus].some(value => value?.toLocaleLowerCase().includes(search))) return false;
    if (filters.deadline === "upcoming" && (!item.deadline || item.deadline < today || item.deadline > end)) return false;
    if (filters.deadline === "overdue" && (!item.deadline || item.deadline >= today)) return false;
    if (filters.deadline === "none" && item.deadline) return false;
    return true;
  }).sort((a, b) => {
    const sorted = filters.sort === "status" ? statuses.indexOf(a.status) - statuses.indexOf(b.status)
      : filters.sort === "type" ? opportunityTypes.indexOf(a.type) - opportunityTypes.indexOf(b.type)
      : filters.sort === "priority" ? priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
      : filters.sort === "deadline" ? (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
      : filters.sort === "last_activity" ? (lastActivity[b.id] ?? "").localeCompare(lastActivity[a.id] ?? "")
      : b.created_at.localeCompare(a.created_at);
    return sorted || a.organization_name.localeCompare(b.organization_name) || a.id.localeCompare(b.id);
  });
}
