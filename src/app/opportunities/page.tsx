import { OpportunityManager } from "@/components/opportunity-manager";
import { withOpportunities } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

export default function OpportunitiesPage() {
  return <OpportunityManager initialOpportunities={withOpportunities(store => store.list())} />;
}
