import { readAdmissions } from "@/lib/admissions-store";
import { withTrackerStore } from "@/lib/tracker-store";
import { goalWithProgress } from "@/lib/goal-model";
import { todayInNewYork } from "@/lib/action-queue";
import { Timeline } from "@/components/timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const data = await withTrackerStore(async store => {
    const [tasks, opportunities, activities, goals] = await Promise.all([store.tasks(), store.list(), store.allActivities(), store.goals()]);
    return { tasks, goals: goals.map(goal => goalWithProgress(goal, { tasks, opportunities, activities })) };
  });
  return <Timeline tasks={data.tasks} goals={data.goals} today={todayInNewYork()} admissions={readAdmissions()} />;
}
