import { readAdmissionsGoalProgress } from "@/lib/admissions-store";
import { withTrackerStore } from "@/lib/tracker-store";
import { goalWithProgress } from "@/lib/goal-model";
import { todayInNewYork } from "@/lib/action-queue";
import { GoalManager } from "@/components/goal-manager";

export const dynamic = "force-dynamic";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const focus = typeof query.goal === "string" ? query.goal : "";
  const goals = await withTrackerStore(async store => {
    const [opportunities, activities, tasks, savedGoals] = await Promise.all([store.list(), store.allActivities(), store.tasks(), store.goals()]);
    return savedGoals.map(goal => goalWithProgress(goal, { opportunities, activities, tasks }));
  });
  const admissionsGoal = readAdmissionsGoalProgress();
  if (admissionsGoal) goals.push(admissionsGoal);
  return <GoalManager key={focus} initialGoals={goals} today={todayInNewYork()} focus={focus} />;
}
