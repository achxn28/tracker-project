import { cookies } from "next/headers";
import { withTrackerStore } from "@/lib/tracker-store";
import { Settings } from "@/components/settings";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const theme = (await cookies()).get("tracker_theme")?.value === "dark" ? "dark" : "light";
  const { follow_up_days: interval } = await withTrackerStore(store => store.preferences());
  return <Settings initialTheme={theme} initialInterval={interval} />;
}
