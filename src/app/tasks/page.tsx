import { scheduledSupplements } from "@/lib/admissions-model";
import { readAdmissions } from "@/lib/admissions-store";
import { TaskManager } from "@/components/task-manager";
import { withTrackerStore } from "@/lib/tracker-store";
import { todayInNewYork } from "@/lib/action-queue";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const opportunityId = typeof query.opportunity === "string" ? query.opportunity : "";
  const taskId = typeof query.task === "string" ? query.task : "";
  const data = await withTrackerStore(async store => {
    const [tasks, opportunities] = await Promise.all([store.tasks(), store.list()]);
    return { tasks, opportunities };
  });
  return <TaskManager key={`${opportunityId}:${taskId}:${query.new === "1"}`} initialTasks={data.tasks} supplements={scheduledSupplements(readAdmissions())} opportunities={data.opportunities} today={todayInNewYork()} initialOpportunityId={opportunityId} initialTaskId={taskId} initiallyAdding={query.new === "1"} />;
}
