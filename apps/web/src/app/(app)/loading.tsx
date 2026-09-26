import { Card } from "@/components/ui/card";

// One shared skeleton for every (app) page: the shell stays put, content swaps in when the server render lands.
// ponytail: pages now stream, so notFound()/redirect() inside a page answer 200 with the right UI (not 404/307).
// Fine for an authed app; move the skeleton down to specific routes if a real status code matters.
export default function Loading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-24" />
        ))}
      </div>
      <Card className="mt-6 space-y-3 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${90 - i * 10}%` }} />
        ))}
      </Card>
    </div>
  );
}
