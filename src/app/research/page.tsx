import { OpportunityManager } from "@/components/opportunity-manager";
import { withTrackerStore } from "@/lib/tracker-store";
import { todayInNewYork } from "@/lib/action-queue";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const selectedId = typeof query.opportunity === "string" ? query.opportunity : "";
  const data = await withTrackerStore(async store => {
    const [opportunities, tasks, activities, preferences] = await Promise.all([store.list(), store.tasks(), store.allActivities(), store.preferences()]);
    const lastActivity: Record<string, string> = {};
    for (const activity of activities) if (!lastActivity[activity.opportunity_id]) lastActivity[activity.opportunity_id] = activity.occurred_at;
    return { opportunities: opportunities.filter(item => item.type === "Research"), tasks, lastActivity, followUpDays: preferences.follow_up_days };
  });
  return <OpportunityManager workspace="research" initialOpportunities={data.opportunities} initialTasks={data.tasks} initialSelectedId={selectedId} lastActivity={data.lastActivity} today={todayInNewYork()} followUpDays={data.followUpDays} key={selectedId} />;
}
