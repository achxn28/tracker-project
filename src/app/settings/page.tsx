import { cookies } from "next/headers";
import { withOpportunities } from "@/lib/opportunities";
import { Settings } from "@/components/settings";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const theme = (await cookies()).get("tracker_theme")?.value === "dark" ? "dark" : "light";
  const interval = withOpportunities(store => store.preferences().follow_up_days);
  return <Settings initialTheme={theme} initialInterval={interval} />;
}
