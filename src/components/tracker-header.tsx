import Link from "next/link";

export function TrackerHeader({ active }: { active: "admissions" | "research" | "dashboard" | "opportunities" | "tasks" | "goals" | "timeline" | "settings" | "clients" }) {
  return <header className="tracker-sidebar border-b lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-56 lg:overflow-y-auto lg:border-b-0 lg:border-r">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:flex-col lg:items-start lg:px-4 lg:py-7">
      <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">Opportunity Tracker</Link><span className="text-sm text-muted-foreground">Summer 2027</span>
    </div>
    <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-5 sm:px-8 lg:flex-col lg:gap-2 lg:px-4" aria-label="Main navigation">
      {([["dashboard", "/", "Dashboard"], ["timeline", "/timeline", "Timeline"], ["admissions", "/admissions", "Admissions"], ["opportunities", "/opportunities", "Opportunities"], ["research", "/research", "Research outreach"], ["tasks", "/tasks", "Tasks"], ["goals", "/goals", "Goals"], ["clients", "/clients", "Novus Clients"], ["settings", "/settings", "Settings"]] as const).map(([key, href, label]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined} className={`tracker-nav-link border-b-2 pb-3 text-sm font-medium lg:rounded-sm lg:border-b-0 lg:border-l-2 lg:px-3 lg:py-3 ${active === key ? "border-primary bg-primary/8 text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</Link>)}
    </nav>
  </header>;
}
