import { OpportunityManager } from "@/components/opportunity-manager";
import { withOpportunities } from "@/lib/opportunities";
import { todayInNewYork } from "@/lib/action-queue";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const selectedId = typeof query.opportunity === "string" ? query.opportunity : "";
  const data = withOpportunities(store => {
    const lastActivity: Record<string, string> = {};
    for (const activity of store.allActivities()) if (!lastActivity[activity.opportunity_id]) lastActivity[activity.opportunity_id] = activity.occurred_at;
    return { opportunities: store.list(), tasks: store.tasks(), lastActivity, followUpDays: store.preferences().follow_up_days };
  });
  return <OpportunityManager initialOpportunities={data.opportunities} initialTasks={data.tasks} initialSelectedId={selectedId} lastActivity={data.lastActivity} today={todayInNewYork()} followUpDays={data.followUpDays} key={selectedId} />;
}
