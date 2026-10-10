import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Star, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LiveStage } from "@/components/vv/LiveStage";
import { LangSelect, ProblemBanner } from "@/components/vv/fields";
import { Logo } from "@/components/vv/primitives";
import { api, ApiError, type LiveCaption, type LiveSession } from "@/lib/api";
import { useLanguages } from "@/lib/auth";
import type { Stage } from "@/lib/listening";
import { useSpeaker } from "@/lib/listening";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/live/$code")({
  head: () => ({ meta: [{ title: "Live session — Voice Verse" }, { name: "robots", content: "noindex" }] }),
  component: Viewer,
});

/** Public listener view: no account needed, the code is the access. */
function Viewer() {
  const { code } = Route.useParams();
  const { data } = useLanguages();
  const settings = useStore((s) => s.settings);
  const [info, setInfo] = useState<LiveSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState(settings.outputLang);
  const [caps, setCaps] = useState<LiveCaption[]>([]);
  const [status, setStatus] = useState<"live" | "ended">("live");
  const [offline, setOffline] = useState(false);
  const [audio, setAudio] = useState(false);
  const [size, setSize] = useState(Math.max(settings.subtitleSize, 24));
  const after = useRef(0);
  const langRef = useRef(lang);
  langRef.current = lang;

  const langs = data?.languages ?? [];
  const toCfg = langs.find((l) => l.code === lang);
  const translating = !!info && lang !== info.sourceLang;
  const ttsOk = translating && !!toCfg?.textToSpeech.supported && typeof speechSynthesis !== "undefined";
  const speaker = useSpeaker({ enabled: audio && ttsOk, locale: toCfg?.textToSpeech.locale, rate: settings.playbackRate, onProblem: () => {} });

  useEffect(() => {
    api.live.get(code.toUpperCase()).then((r) => { setInfo(r.session); setStatus(r.session.status); api.live.join(code).catch(() => {}); })
      .catch((e) => { if (e instanceof ApiError && e.status === 404) setMissing(true); else setOffline(true); });
  }, [code]);

  useEffect(() => {
    if (!info) return;
    after.current = 0; setCaps([]);
    let stop = false;
    const tick = async () => {
      try {
        const l = langRef.current !== info.sourceLang ? langRef.current : undefined;
        const r = await api.live.captions(code, after.current, l);
        if (stop) return;
        setOffline(false); setStatus(r.status);
        if (r.captions.length) {
          after.current = r.captions[r.captions.length - 1]!.seq;
          setCaps((c) => [...c, ...r.captions]);
          const t = r.captions[r.captions.length - 1]!;
          if (t.translatedText) speaker.say(t.translatedText);
        }
      } catch { if (!stop) setOffline(true); }
    };
    tick();
    const id = setInterval(() => { if (status === "live") tick(); }, 1500);
    return () => { stop = true; clearInterval(id); };
  }, [info, lang, code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return (
      <div className="grid min-h-screen place-items-center px-5 text-center">
        <div className="rise max-w-sm"><Logo className="mb-8" /><h1 className="text-2xl font-semibold">Session not found</h1>
          <p className="mt-2 text-muted-foreground">No session has the code {code.toUpperCase()}. Check it with the speaker.</p>
          <Button asChild className="mt-6"><a href="/app/join">Try another code</a></Button></div>
      </div>
    );
  }

  const last = caps[caps.length - 1];
  const prev = caps[caps.length - 2];
  const stage: Stage = status === "ended" ? "completed" : offline ? "error" : "listening";

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-5 py-6">
      <div className="mb-6 flex items-center justify-between"><Logo /><span className="font-mono text-xs text-muted-foreground">{code.toUpperCase()}</span></div>

      {!info ? (
        <div className="shimmer h-72 rounded-2xl" aria-label="Joining session" />
      ) : (
        <div className="rise">
          <h1 className="mb-1 text-2xl font-semibold">{info.title}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{info.hostName ? `Hosted by ${info.hostName}` : "Live session"}</p>
          <LiveStage stage={stage} title="Live" fromName={langs.find((l) => l.code === info.sourceLang)?.name ?? info.sourceLang} toName={toCfg?.name ?? lang}
            original={last?.text ?? ""} translated={translating ? last?.translatedText ?? "" : ""} previousOriginal={prev?.text} previousTranslated={translating ? prev?.translatedText ?? undefined : undefined}
            live={status === "live" && !offline} showTranslation={translating} translationPending={false} subtitleSize={size} />

          {offline && <div className="mt-4"><ProblemBanner title="Reconnecting…" body="We lost the connection. Captions will continue when it returns." /></div>}
          {status === "ended" && <p className="mt-4 text-sm text-muted-foreground">The speaker has ended this session.</p>}
          {translating && caps.length > 0 && !caps.some((c) => c.translated) && (
            <div className="mt-4"><ProblemBanner title="Translation isn't available yet" body={`Showing the original words. ${toCfg?.name ?? "This language"} appears once translation is connected.`} /></div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-4 rounded-xl border bg-card p-5">
              <LangSelect label="Show subtitles in" value={lang} onChange={setLang} langs={langs} filter={(l) => l.translation || l.code === info.sourceLang} />
              <div><Label>Text size</Label><Slider className="mt-3" min={16} max={64} step={2} value={[size]} onValueChange={([v]) => setSize(v!)} aria-label="Text size" /></div>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <Label htmlFor="aud" className="flex items-center gap-2 text-sm font-medium">{audio && ttsOk ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Read aloud</Label>
                <Switch id="aud" checked={audio && ttsOk} onCheckedChange={setAudio} disabled={!ttsOk} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{ttsOk ? "Use earphones in a shared room." : `Spoken ${toCfg?.name ?? "output"} isn't available on this device yet.`}</p>
            </div>
          </div>

          {status === "ended" && <Feedback code={code} />}
        </div>
      )}
    </div>
  );
}

function Feedback({ code }: { code: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p className="rise mt-6 rounded-xl border bg-card p-5 text-sm">Thank you. Your feedback helps us improve Voice Verse.</p>;
  return (
    <div className="rise mt-6 rounded-xl border bg-card p-5">
      <h2 className="font-medium">How was it?</h2>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="rounded p-1 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring">
            <Star className={cn("h-7 w-7", n <= rating ? "fill-signal text-signal" : "text-muted-foreground/50")} />
          </button>
        ))}
      </div>
      <Textarea className="mt-3" rows={2} maxLength={1000} placeholder="Anything we should know? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {state === "error" && <p role="alert" className="mt-2 text-sm text-destructive">Couldn't send. Try again.</p>}
      <Button className="mt-3" disabled={!rating || state === "busy"} onClick={async () => {
        setState("busy");
        try { await api.live.feedback({ code: code.toUpperCase(), rating, comment: comment.trim() || undefined }); setState("done"); } catch { setState("error"); }
      }}>Send feedback</Button>
    </div>
  );
}
