import { withOpportunities } from "@/lib/opportunities";
import { toCsv } from "@/lib/csv";
import { optionalFields } from "@/lib/opportunity-model";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (dataset !== "opportunities" && dataset !== "activities") return Response.json({ error: "Unknown export." }, { status: 404 });
  try {
    const csv = withOpportunities(store => dataset === "opportunities"
      ? toCsv(["id", "organization_name", "title", "type", "status", "priority", "work_arrangement", ...optionalFields, "closed_outcome", "archived_at", "created_at", "updated_at"], store.list())
      : toCsv(["id", "opportunity_id", "activity_type", "occurred_at", "notes", "positive_response", "created_at"], store.allActivities()));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${dataset}.csv"`, "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "The export could not be generated. Please try again." }, { status: 500 }); }
}
