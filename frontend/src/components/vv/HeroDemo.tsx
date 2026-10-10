import { useEffect, useState } from "react";
import { Mic, Languages, Volume2 } from "lucide-react";
import { DEMO_SCRIPT } from "@/lib/languages";
import { Waveform } from "./primitives";

const STAGES = ["Listening", "Processing", "Translating", "Ready"] as const;

/** A restrained, self-running preview of the listening interface. */
export function HeroDemo() {
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);
  const [stage, setStage] = useState(0);
  const line = DEMO_SCRIPT[i % DEMO_SCRIPT.length]!;

  useEffect(() => {
    if (stage === 0) {
      if (chars < line.en.length) {
        const t = setTimeout(() => setChars((c) => c + 1), 38);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setStage(1), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (stage < 3) setStage(stage + 1);
      else { setI((x) => x + 1); setChars(0); setStage(0); }
    }, stage === 3 ? 3200 : 650);
    return () => clearTimeout(t);
  }, [stage, chars, line.en.length]);

  const prev = DEMO_SCRIPT[(i + DEMO_SCRIPT.length - 1) % DEMO_SCRIPT.length]!;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-panel">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-signal/12 text-signal">
            <span className="breathe absolute inset-0 rounded-full bg-signal/30" />
            <Mic className="relative h-3.5 w-3.5" />
          </span>
          <span className="font-medium">Live session</span>
          <span className="hidden text-muted-foreground sm:inline">· Main auditorium</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="rounded border px-1.5 py-0.5">EN</span>→<span className="rounded border border-primary/30 bg-accent px-1.5 py-0.5 text-accent-foreground">FR</span>
        </div>
      </div>

      <div className="grid gap-px bg-border md:grid-cols-2">
        <div className="bg-card p-5">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Waveform active={stage === 0} bars={4} className="h-3 text-signal" /> Speaker · English
          </p>
          <p className="mb-3 text-sm text-muted-foreground/70 line-clamp-1">{prev.en}</p>
          <p className="min-h-[4.5rem] text-[17px] leading-relaxed">
            {line.en.slice(0, chars)}
            {stage === 0 && <span className="caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-foreground" />}
          </p>
        </div>
        <div className="bg-card p-5">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Languages className="h-3.5 w-3.5" /> Output · French
          </p>
          <p className="mb-3 text-sm text-muted-foreground/70 line-clamp-1">{prev.fr}</p>
          <div className="min-h-[4.5rem]">
            {stage === 3 ? (
              <p key={i} className="rise text-[17px] leading-relaxed">{line.fr}</p>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="shimmer h-3.5 w-11/12 rounded" />
                <div className="shimmer h-3.5 w-2/3 rounded" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-5 py-3 text-xs">
        <ol className="flex items-center gap-1.5">
          {STAGES.map((s, idx) => (
            <li key={s} className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-300 ${idx === stage ? "bg-primary text-primary-foreground" : idx < stage ? "text-foreground" : "text-muted-foreground/60"}`}>
              {s}
            </li>
          ))}
        </ol>
        <span className={`hidden items-center gap-2 transition-opacity duration-300 sm:flex ${stage === 3 ? "opacity-100" : "opacity-40"}`}>
          <Volume2 className="h-3.5 w-3.5" /> <Waveform active={stage === 3} bars={5} className="h-3 text-primary" />
        </span>
      </div>
    </div>
  );
}
