import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock3, History, KeyRound, Mic, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/vv/primitives";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth, useLanguages } from "@/lib/auth";
import { fmtDuration, langName } from "@/lib/languages";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/")({ component: Dashboard });

function Dashboard() {
  const { user } = useAuth();
  const sessions = useStore((s) => s.sessions);
  const langs = useLanguages().data?.languages;
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const nameOf = (c: string) => langs?.find((l) => l.code === c)?.name ?? langName(c);
  const invited = useQuery({ queryKey: ["invited"], queryFn: () => api.live.invited(), staleTime: 15_000, refetchInterval: 20_000, retry: false }).data?.sessions ?? [];
  const total = sessions.reduce((n, s) => n + s.durationSec, 0);
  const lines = sessions.reduce((n, s) => n + s.segments.length, 0);

  return (
    <>
      <PageHeader title={`Hello${user ? `, ${user.name.split(" ")[0]}` : ""}`} description="Start a listening session, or join a speaker's room with a code." />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rise d-1 card-hover rounded-2xl border bg-ink p-7 text-ink-foreground">
          <Mic className="h-6 w-6 opacity-80" strokeWidth={1.75} />
          <h2 className="mt-6 font-display text-3xl leading-tight">Listen to the room, in your language.</h2>
          <p className="mt-2 max-w-md text-sm opacity-70">Use your phone's microphone to turn what you hear into subtitles and translation.</p>
          <Button size="lg" asChild className="mt-7 bg-ink-foreground text-ink hover:bg-ink-foreground/90"><Link to="/app/listen">Start listening <ArrowRight /></Link></Button>
        </div>

        <div className="rise d-2 rounded-2xl border bg-card p-6">
          <KeyRound className="h-5 w-5 text-primary" strokeWidth={1.75} />
          <h2 className="mt-4 text-lg font-medium">Join a speaker's session</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter the code shown by the speaker.</p>
          <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav({ to: "/live/$code", params: { code: code.trim().toUpperCase() } }); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} placeholder="K7M2QX" aria-label="Session code" className="h-11 font-mono uppercase tracking-widest" />
            <Button type="submit" size="lg" disabled={!code.trim()}>Join</Button>
          </form>
          {user?.role === "educator" && (
            <Button variant="outline" asChild className="mt-4 w-full"><Link to="/app/host"><Radio /> Host a session</Link></Button>
          )}
        </div>
      </div>

      <div className="rise d-3 mt-4 grid gap-4 sm:grid-cols-3">
        {[
          [History, "Sessions", String(sessions.length)],
          [Clock3, "Time listened", total ? fmtDuration(total) : "0s"],
          [Mic, "Sentences captured", String(lines)],
        ].map(([I, label, val]) => {
          const Icon = I as typeof Mic;
          return (
            <div key={label as string} className="rounded-xl border bg-card p-5">
              <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="mt-4 font-display text-3xl">{val as string}</p>
              <p className="text-sm text-muted-foreground">{label as string}</p>
            </div>
          );
        })}
      </div>

      {invited.length > 0 && (
        <>
          <h2 className="mb-4 mt-12 text-lg font-medium">Invited to</h2>
          <ul className="rise grid gap-3 sm:grid-cols-2">
            {invited.map((s) => (
              <li key={s.code}>
                <Link to="/live/$code" params={{ code: s.code }} className="card-hover flex items-center justify-between gap-3 rounded-xl border bg-card p-5">
                  <span className="min-w-0"><span className="block truncate font-medium">{s.title}</span><span className="text-sm text-muted-foreground">{s.hostName ? `Hosted by ${s.hostName}` : "Live now"}</span></span>
                  <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs text-success">Live</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mb-4 mt-12 text-lg font-medium">Recent sessions</h2>
      {sessions.length === 0 ? (
        <EmptyState icon={<History />} title="No sessions yet" body="Sessions you listen to are saved here, on this device only." action={<Button asChild><Link to="/app/listen">Start listening</Link></Button>} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {sessions.slice(0, 5).map((s) => (
            <li key={s.id}>
              <Link to="/app/history/$id" params={{ id: s.id }} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/60">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{new Date(s.startedAt).toLocaleString()} · {nameOf(s.from)} → {nameOf(s.to)}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtDuration(s.durationSec)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
