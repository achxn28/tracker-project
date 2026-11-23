import { TaskManager } from "@/components/task-manager";
import { withOpportunities } from "@/lib/opportunities";
import { todayInNewYork } from "@/lib/action-queue";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const opportunityId = typeof query.opportunity === "string" ? query.opportunity : "";
  const taskId = typeof query.task === "string" ? query.task : "";
  const data = withOpportunities(store => ({ tasks: store.tasks(), opportunities: store.list() }));
  return <TaskManager key={`${opportunityId}:${taskId}:${query.new === "1"}`} initialTasks={data.tasks} opportunities={data.opportunities} today={todayInNewYork()} initialOpportunityId={opportunityId} initialTaskId={taskId} initiallyAdding={query.new === "1"} />;
}
