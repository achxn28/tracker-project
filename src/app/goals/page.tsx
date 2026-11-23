import { withOpportunities } from "@/lib/opportunities";
import { goalWithProgress } from "@/lib/goal-model";
import { todayInNewYork } from "@/lib/action-queue";
import { GoalManager } from "@/components/goal-manager";

export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const focus = typeof query.goal === "string" ? query.goal : "";
  const goals = withOpportunities(store => {
    const data = { opportunities: store.list(), activities: store.allActivities(), tasks: store.tasks() };
    return store.goals().map(goal => goalWithProgress(goal, data));
  });
  return <GoalManager key={focus} initialGoals={goals} today={todayInNewYork()} focus={focus} />;
}
