import { withOpportunities } from "@/lib/opportunities";
import { goalWithProgress } from "@/lib/goal-model";
import { todayInNewYork } from "@/lib/action-queue";
import { Timeline } from "@/components/timeline";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  const data = withOpportunities(store => {
    const source = { tasks: store.tasks(), opportunities: store.list(), activities: store.allActivities() };
    return { tasks: source.tasks, goals: store.goals().map(goal => goalWithProgress(goal, source)) };
  });
  return <Timeline tasks={data.tasks} goals={data.goals} today={todayInNewYork()} />;
}
