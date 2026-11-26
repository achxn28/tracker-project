import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer 2027 Opportunity Tracker",
  description:
    "A personal workspace for research outreach, startup recruiting, and internship applications.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const dark = cookieStore.get("tracker_theme")?.value === "dark";
  const desktop = requestHeaders.get("user-agent")?.split(" ").includes("TrackerDesktop/1");
  const classes = [dark ? "dark" : "", desktop ? "tracker-desktop" : ""].filter(Boolean).join(" ");
  return (
    <html lang="en" className={classes || undefined}>
      <body className="lg:pl-56">{children}</body>
    </html>
  );
}
