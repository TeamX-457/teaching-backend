import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/vv/primitives";
import { useLanguages } from "@/lib/auth";
import { fmtClock, fmtDuration, langName } from "@/lib/languages";
import { actions, useStore } from "@/lib/store";

export const Route = createFileRoute("/app/history/$id")({
  head: () => ({ meta: [{ title: "Session — Voice Verse" }] }),
  component: SessionDetail,
});

function SessionDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const s = useStore((st) => st.sessions.find((x) => x.id === id));
  const langs = useLanguages().data?.languages;
  const nameOf = (c: string) => langs?.find((l) => l.code === c)?.name ?? langName(c);

  if (!s) {
    return <EmptyState icon={<Trash2 />} title="Session not found" body="It may have been deleted, or it was saved on another device." action={<Button asChild><Link to="/app/history">Back to history</Link></Button>} />;
  }

  function download() {
    const text = [`${s!.title}`, `${new Date(s!.startedAt).toLocaleString()} · ${nameOf(s!.from)} → ${nameOf(s!.to)}`, "",
      ...s!.segments.flatMap((g) => [`[${fmtClock(g.t)}] ${g.original}`, ...(g.translated ? [`        ${g.translated}`] : []), ""])].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${s!.title.replace(/[^\w]+/g, "-")}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-3 mb-4"><Link to="/app/history"><ArrowLeft /> History</Link></Button>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[28px]">{s.title}</h1>
          <p className="mt-1.5 text-muted-foreground">{new Date(s.startedAt).toLocaleString()} · {fmtDuration(s.durationSec)} · {nameOf(s.from)} → {nameOf(s.to)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={download}><Download /> Download</Button>
          <Button variant="outline" onClick={() => { actions.deleteSession(s.id); nav({ to: "/app/history" }); }}><Trash2 /> Delete</Button>
        </div>
      </div>
      <ol className="space-y-px overflow-hidden rounded-xl border bg-border">
        {s.segments.map((g, i) => (
          <li key={g.id} className="rise grid gap-1 bg-card px-5 py-4 md:grid-cols-[64px_1fr_1fr] md:gap-6" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <span className="font-mono text-xs text-muted-foreground">{fmtClock(g.t)}</span>
            <p>{g.original}</p>
            <p className="text-primary">{g.translated || <span className="text-muted-foreground/60">—</span>}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
