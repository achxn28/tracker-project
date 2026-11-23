import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";

export function TrackerHeader({ active }: { active: "dashboard" | "opportunities" | "tasks" }) {
  return <header className="border-b bg-background">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight"><BriefcaseBusiness className="size-5" aria-hidden="true" />Opportunity Tracker</Link><span className="text-sm text-muted-foreground">Summer 2027</span>
    </div>
    <nav className="mx-auto flex max-w-6xl gap-6 px-5 sm:px-8" aria-label="Main navigation">
      {([["dashboard", "/", "Dashboard"], ["opportunities", "/opportunities", "Opportunities"], ["tasks", "/tasks", "Tasks"]] as const).map(([key, href, label]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined} className={`border-b-2 pb-3 text-sm font-medium ${active === key ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</Link>)}
    </nav>
  </header>;
}
