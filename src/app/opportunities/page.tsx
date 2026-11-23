import { OpportunityManager } from "@/components/opportunity-manager";
import { withOpportunities } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const selectedId = typeof query.opportunity === "string" ? query.opportunity : "";
  const data = withOpportunities(store => ({ opportunities: store.list(), tasks: store.tasks() }));
  return <OpportunityManager initialOpportunities={data.opportunities} initialTasks={data.tasks} initialSelectedId={selectedId} key={selectedId} />;
}
