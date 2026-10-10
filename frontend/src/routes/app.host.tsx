import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveStage } from "@/components/vv/LiveStage";
import { CopyButton, LangSelect, ProblemBanner } from "@/components/vv/fields";
import { EmptyState, PageHeader } from "@/components/vv/primitives";
import { api, VENUES, venueLabel, type LiveSession, type VenueType } from "@/lib/api";
import { useAuth, useLanguages } from "@/lib/auth";
import { speechSupported, useRecognizer, type Problem, type Stage } from "@/lib/listening";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/app/host")({
  head: () => ({ meta: [{ title: "Host a session — Voice Verse" }] }),
  component: HostPage,
});

function HostPage() {
  const { user } = useAuth();
  const { data } = useLanguages();
  const [session, setSession] = useState<LiveSession | null>(null);

  if (user && user.role !== "educator") {
    return <EmptyState icon={<Mic />} title="Hosting is for speaker accounts" body="Create a speaker account to host sessions. You can still listen and join sessions with a code." action={<Button asChild><Link to="/app/join">Join a session</Link></Button>} />;
  }
  if (!data) return <div className="shimmer h-64 rounded-2xl" />;
  return session
    ? <Broadcast session={session} langs={data.languages} onEnded={() => setSession(null)} />
    : <Create langs={data.languages} onCreated={setSession} />;
}

function Create({ langs, onCreated }: { langs: { code: string; name: string; speechRecognition: { supported: boolean; locale?: string }; translation: boolean; textToSpeech: { supported: boolean } }[]; onCreated: (s: LiveSession) => void }) {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState<VenueType>("classroom");
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(undefined);
    try { onCreated((await api.live.create({ title: title.trim(), venueType: venue, sourceLang: lang })).session); }
    catch { setErr("We couldn't start the session. Please try again."); setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Host a session" description="Speak normally. Your audience follows along with live subtitles and translation on their own phones." />
      <form onSubmit={go} className="rise max-w-xl space-y-5 rounded-2xl border bg-card p-6">
        <div>
          <Label htmlFor="title">Session title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="SS2 Biology, Sunday service…" className="mt-2 h-11" required />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label>Venue</Label>
            <Select value={venue} onValueChange={(v) => setVenue(v as VenueType)}>
              <SelectTrigger className="mt-2 h-11" aria-label="Venue"><SelectValue /></SelectTrigger>
              <SelectContent>{VENUES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <LangSelect label="Language you speak" value={lang} onChange={setLang} langs={langs as never} filter={(l) => l.speechRecognition.supported} />
        </div>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <Button size="lg" className="w-full" disabled={!title.trim() || busy}>{busy ? "Starting…" : "Create session"}</Button>
      </form>
    </>
  );
}

function Broadcast({ session, langs, onEnded }: { session: LiveSession; langs: { code: string; name: string; speechRecognition: { supported: boolean; locale?: string } }[]; onEnded: () => void }) {
  const size = useStore((s) => s.settings.subtitleSize);
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sendError, setSendError] = useState(false);
  const [ended, setEnded] = useState(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const cfg = langs.find((l) => l.code === session.sourceLang);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/live/${session.code}`;

  const send = useCallback((text: string) => {
    chain.current = chain.current.then(() =>
      api.live.addCaption(session.code, text).then(() => setSendError(false)).catch(() => setSendError(true)));
  }, [session.code]);

  const rec = useRecognizer({
    locale: cfg?.speechRecognition.locale,
    onPartial: setPartial,
    onFinal: (t) => { setPartial(""); setLines((l) => [...l, t]); send(t); },
    onProblem: (p) => { setProblem(p); if (p.fatal) setOn(false); },
  });
  useEffect(() => () => rec.stop(), [rec]);

  const stage: Stage = ended ? "completed" : problem?.fatal ? "error" : on ? "listening" : "paused";
  const last = partial || lines[lines.length - 1] || "";

  return (
    <>
      <PageHeader title={session.title} description={`${venueLabel(session.venueType)} · live`} />
      <div className="rise grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Share this code</p>
          <p className="mt-2 font-mono text-5xl tracking-[0.25em]" aria-label={`Session code ${session.code.split("").join(" ")}`}>{session.code}</p>
          <p className="mt-3 break-all text-sm text-muted-foreground">{link}</p>
          <div className="mt-4 flex gap-2"><CopyButton text={session.code} label="Copy code" /><CopyButton text={link} label="Copy link" /></div>
        </div>
      </div>

      <div className="mt-6"><LiveStage stage={stage} title="Your broadcast" fromName={cfg?.name ?? session.sourceLang} toName="" original={last} translated="" live={on && !ended} showTranslation={false} translationPending={false} subtitleSize={size} /></div>

      {(problem || sendError) && (
        <div className="mt-4"><ProblemBanner title={sendError ? "Your audience may be missing captions" : problem!.title} body={sendError ? "Captions couldn't be sent. Check your connection; sending retries automatically." : problem!.body} onDismiss={problem && !problem.fatal ? () => setProblem(null) : undefined} /></div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button size="lg" className="flex-1" disabled={ended || !speechSupported()} variant={on ? "outline" : "default"}
          onClick={() => { if (on) { rec.stop(); setOn(false); setPartial(""); } else { setProblem(null); if (rec.start()) setOn(true); } }}>
          {on ? <><Pause /> Pause</> : <><Play /> {lines.length ? "Resume" : "Start speaking"}</>}
        </Button>
        <Button size="lg" variant="outline" className="flex-1" disabled={ended}
          onClick={async () => { rec.stop(); setOn(false); await chain.current; try { await api.live.end(session.code); setEnded(true); } catch { setProblem({ key: "end", title: "Couldn't end the session", body: "Try again in a moment.", fatal: false }); } }}>
          <Square /> End session
        </Button>
      </div>
      {!speechSupported() && <p className="mt-3 text-sm text-muted-foreground">Speaking needs Chrome or Edge.</p>}
      {ended && <Button className="mt-4" onClick={onEnded}>Start another session</Button>}
    </>
  );
}
