import { TrackerHeader } from "@/components/tracker-header";
import { Admissions } from "@/components/admissions";
import { readAdmissions, readAdmissionsPreview } from "@/lib/admissions-store";

export const dynamic = "force-dynamic";

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ college?: string }> }) {
  const { college } = await searchParams;
  const data = readAdmissions();
  const source = readAdmissionsPreview();
  const collegeIds = new Set(data.colleges.map(item => item.id));
  const supplementIds = new Set(data.supplements.map(item => item.id));
  const preview = source && {
    colleges: source.colleges.filter(item => !collegeIds.has(item.id)),
    supplements: source.supplements.filter(item => !supplementIds.has(item.id)),
  };

  return <div className="min-h-svh">
    <TrackerHeader active="admissions" />
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Admissions</h1>
        <p className="mt-2 text-muted-foreground">Plan your supplements and keep track of application deadlines.</p>
      </header>
      <Admissions key={college ?? ""} data={data} preview={preview} selectedCollege={college} />
    </main>
  </div>;
}
