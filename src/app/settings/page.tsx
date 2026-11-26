import { cookies } from "next/headers";
import { withTrackerStore } from "@/lib/tracker-store";
import { Settings } from "@/components/settings";
import { GmailSettings } from "@/components/gmail-settings";

export const dynamic = "force-dynamic";
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ gmail?: string | string[] }> }) {
  const { gmail } = await searchParams;
  const theme = (await cookies()).get("tracker_theme")?.value === "dark" ? "dark" : "light";
  const { follow_up_days: interval } = await withTrackerStore(store => store.preferences());
  return <Settings initialTheme={theme} initialInterval={interval} gmailPanel={<GmailSettings notice={typeof gmail === "string" ? gmail : undefined} />} />;
}
