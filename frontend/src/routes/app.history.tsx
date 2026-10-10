import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EmptyState, PageHeader } from "@/components/vv/primitives";
import { useLanguages } from "@/lib/auth";
import { fmtDuration, langName } from "@/lib/languages";
import { actions, useStore } from "@/lib/store";

export const Route = createFileRoute("/app/history")({
  head: () => ({ meta: [{ title: "History — Voice Verse" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const path = useLocation({ select: (l) => l.pathname });
  const sessions = useStore((s) => s.sessions);
  const langs = useLanguages().data?.languages;
  const nameOf = (c: string) => langs?.find((l) => l.code === c)?.name ?? langName(c);
  if (path !== "/app/history") return <Outlet />;

  return (
    <>
      <PageHeader
        title="History"
        description="Your past sessions, saved on this device only. No audio is ever stored."
        actions={sessions.length > 0 ? (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline"><Trash2 /> Delete all</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all sessions?</AlertDialogTitle>
                <AlertDialogDescription>This removes every saved transcript from this device. It can't be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={actions.clearSessions}>Delete all</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : undefined}
      />
      {sessions.length === 0 ? (
        <EmptyState icon={<History />} title="Nothing saved yet" body="When you stop a listening session, its transcript is saved here for you to review." action={<Button asChild><Link to="/app/listen">Start listening</Link></Button>} />
      ) : (
        <ul className="grid gap-3">
          {sessions.map((s, i) => (
            <li key={s.id} className="rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <Link to="/app/history/$id" params={{ id: s.id }} className="card-hover block rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtDuration(s.durationSec)}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{nameOf(s.from)} → {nameOf(s.to)} · {s.segments.length} {s.segments.length === 1 ? "sentence" : "sentences"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
