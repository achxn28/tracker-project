import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader className="gap-3">
          <p className="text-sm font-medium text-muted-foreground">Summer 2027</p>
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            <h1>Opportunity Tracker</h1>
          </CardTitle>
          <CardDescription className="text-base leading-relaxed">
            A workspace for research outreach, startup recruiting, and internship
            applications.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
