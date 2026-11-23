import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer 2027 Opportunity Tracker",
  description:
    "A personal workspace for research outreach, startup recruiting, and internship applications.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await cookies()).get("tracker_theme")?.value;
  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined}>
      <body>{children}</body>
    </html>
  );
}
