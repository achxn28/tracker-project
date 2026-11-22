import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer 2027 Opportunity Tracker",
  description:
    "A personal workspace for research outreach, startup recruiting, and internship applications.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
