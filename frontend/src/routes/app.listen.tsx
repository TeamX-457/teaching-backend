import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, Pause, Play, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveStage } from "@/components/vv/LiveStage";
import { LangSelect, ProblemBanner } from "@/components/vv/fields";
import { PageHeader } from "@/components/vv/primitives";
import { useLanguages } from "@/lib/auth";
import { VENUES, venueLabel, type VenueType } from "@/lib/api";
import { fmtClock } from "@/lib/languages";
import { speechSupported, useListening } from "@/lib/listening";
import { actions, useStore } from "@/lib/store";

export const Route = createFileRoute("/app/listen")({
  head: () => ({ meta: [{ title: "Listening — Voice Verse" }] }),
  component: ListenPage,
});

function ListenPage() {
  const { data, isPending, isError } = useLanguages();
  if (isPending) return <div className="shimmer h-72 rounded-2xl" aria-label="Loading languages" />;
  if (isError || !data) {
    return <ProblemBanner title="Can't reach Voice Verse" body="Check your connection and reload the page." />;
  }
  return <Session langs={data.languages} providerReady={data.translationProviderConfigured} />;
}

function Session({ langs, providerReady }: { langs: NonNullable<ReturnType<typeof useLanguages>["data"]>["languages"]; providerReady: boolean }) {
  const settings = useStore((s) => s.settings);
  const nav = useNavigate();
  const canListen = (c: string) => !!langs.find((l) => l.code === c)?.speechRecognition.supported;

  const [venue, setVenue] = useState<VenueType>("classroom");
  const [from, setFrom] = useState(canListen(settings.inputLang) ? settings.inputLang : "en");
  const [to, setTo] = useState(langs.some((l) => l.code === settings.outputLang) ? settings.outputLang : "ibb");
  const [audio, setAudio] = useState(settings.audioOutput);
  const [begun, setBegun] = useState(false);
  const [saved, setSaved] = useState(false);
  const [size, setSize] = useState(settings.subtitleSize);
  const logRef = useRef<HTMLDivElement>(null);

  const L = useListening({ from, to, langs, audio, rate: settings.playbackRate });
  const toCfg = langs.find((l) => l.code === to);
  const showTr = from !== to;
  const ttsOk = !!toCfg?.textToSpeech.supported && typeof speechSynthesis !== "undefined";

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [L.segments.length]);

  // Save once when the session completes.
  useEffect(() => {
    if (L.stage !== "completed" || saved || L.segments.length === 0) return;
    setSaved(true);
    if (!settings.saveHistory) return;
    const id = `s-${L.startedAt}`;
    actions.addSession({
      id, title: `${venueLabel(venue)} · ${new Date(L.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
      context: venueLabel(venue), startedAt: L.startedAt, durationSec: L.durationSec, from, to, segments: L.segments,
    });
    nav({ to: "/app/history/$id", params: { id } });
  }, [L.stage, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = L.segments[L.segments.length - 1];
  const prev = L.segments[L.segments.length - 2];
  const current = L.partial || last?.original || "";
  const liveTranslation = L.partial ? "" : last?.translated || "";

  // ---------- Set-up ----------
  if (!begun) {
    return (
      <>
        <PageHeader title="Start listening" description="Choose what is being spoken and the language you want to understand." />
        {!speechSupported() && <div className="mb-6"><ProblemBanner title="Live listening needs Chrome or Edge" body="This browser can't turn speech into text. Open Voice Verse in Chrome or Edge to continue." /></div>}
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="rise space-y-6 rounded-2xl border bg-card p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <LangSelect label="Language being spoken" value={from} onChange={setFrom} langs={langs} filter={(l) => l.speechRecognition.supported} hint="Only languages your device can recognise are listed." />
              <LangSelect label="Language I understand" value={to} onChange={setTo} langs={langs} filter={(l) => l.translation || l.code === from} />
            </div>
            <div>
              <Label>Where are you?</Label>
              <Select value={venue} onValueChange={(v) => setVenue(v as VenueType)}>
                <SelectTrigger className="mt-2 h-11" aria-label="Where are you?"><SelectValue /></SelectTrigger>
                <SelectContent>{VENUES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {from !== to && !providerReady && (
              <p className="rounded-lg bg-secondary px-4 py-3 text-sm text-muted-foreground">Translation isn't connected to a service yet. Subtitles will work; translated text appears once it's connected.</p>
            )}
            <Button size="lg" className="w-full" disabled={!speechSupported() || !canListen(from)} onClick={() => { setBegun(true); L.start(); }}>
              <Mic /> Start listening
            </Button>
          </div>
          <aside className="rise d-2 space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Before you start</p>
            <p>Hold your phone towards the speaker. Your browser will ask to use the microphone.</p>
            <p>Audio is processed as you listen and is never stored. Only the text is kept, on this device, if you choose.</p>
          </aside>
        </div>
      </>
    );
  }

  // ---------- Live ----------
  const live = L.stage === "listening" || L.stage === "translating" || L.stage === "processing" || L.stage === "speaking";
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{venueLabel(venue)}</h1>
        <span className="font-mono text-sm text-muted-foreground" aria-label="Time listened">{fmtClock(L.elapsed)}</span>
      </div>

      <LiveStage
        stage={L.stage}
        title="Your session"
        fromName={langs.find((l) => l.code === from)?.name ?? from}
        toName={toCfg?.name ?? to}
        original={current}
        translated={liveTranslation}
        previousOriginal={L.partial ? last?.original : prev?.original}
        previousTranslated={L.partial ? last?.translated : prev?.translated}
        live={L.stage === "listening" || L.stage === "speaking" || L.stage === "translating"}
        showTranslation={showTr}
        translationPending={L.pending > 0}
        subtitleSize={size}
      />

      {L.problem && (
        <div className="mt-4">
          <ProblemBanner title={L.problem.title} body={L.problem.body} onDismiss={L.problem.fatal ? undefined : L.dismissProblem}
            action={L.problem.fatal && L.stage === "error" ? <Button size="sm" onClick={L.start}>Try again</Button> : undefined} />
        </div>
      )}

      <div className="rise mt-5 flex flex-wrap gap-3">
        {L.stage === "paused" ? (
          <Button size="lg" className="flex-1" onClick={L.start}><Play /> Resume</Button>
        ) : (
          <Button size="lg" variant="outline" className="flex-1" onClick={L.pause} disabled={!live}><Pause /> Pause</Button>
        )}
        <Button size="lg" className="flex-1" variant="default" onClick={L.stop} disabled={L.stage === "completed"}><Square /> Stop &amp; save</Button>
      </div>

      <div className="rise d-2 mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <p className="text-sm font-medium">Subtitle size</p>
          <Slider min={16} max={56} step={2} value={[size]} onValueChange={([v]) => setSize(v!)} aria-label="Subtitle size" />
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="audio" className="flex items-center gap-2 text-sm font-medium">{audio && ttsOk ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Speak the translation</Label>
            <Switch id="audio" checked={audio && ttsOk} onCheckedChange={setAudio} disabled={!ttsOk || !showTr} />
          </div>
          {ttsOk && showTr ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={L.speaker.resume} disabled={!L.speaker.paused}><Play /> Play</Button>
              <Button size="sm" variant="outline" onClick={L.speaker.pause} disabled={!L.speaker.speaking || L.speaker.paused}><Pause /> Pause</Button>
              <Button size="sm" variant="outline" onClick={L.speaker.stop}><Square /> Stop</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Spoken {toCfg?.name ?? "output"} isn't available on this device yet. Read the text instead.</p>
          )}
          {settings.preferHeadphones && audio && <p className="text-xs text-muted-foreground">Tip: connect earphones so the room isn't disturbed.</p>}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-medium">Transcript</h2>
      <div ref={logRef} className="max-h-80 overflow-y-auto rounded-xl border bg-card">
        {L.segments.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Sentences appear here as they're spoken.</p>
        ) : (
          <ul className="divide-y">
            {L.segments.map((s) => (
              <li key={s.id} className="fade-in px-5 py-3.5">
                <span className="font-mono text-xs text-muted-foreground">{fmtClock(s.t)}</span>
                <p className="mt-0.5">{s.original}</p>
                {s.translated && <p className="mt-0.5 text-primary">{s.translated}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
