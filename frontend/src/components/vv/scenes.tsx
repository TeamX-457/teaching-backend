import { useEffect, useState } from "react";
import { DEMO_SCRIPT } from "@/lib/languages";
import { Waveform } from "./primitives";

/** A voice leaves a speaker and fills the room. */
export function SoundScene() {
  return (
    <div className="relative grid h-full w-full place-items-center text-ink-foreground">
      <svg viewBox="0 0 400 300" className="h-full w-full" aria-label="A speaker's voice spreading through a room" role="img">
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} className="arc" style={{ ["--i" as string]: i }} cx="120" cy="150" r="130" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
        ))}
        <circle cx="120" cy="150" r="26" fill="var(--signal)" />
        <path d="M108 150v0M114 142v16M120 136v28M126 142v16M132 148v4" stroke="var(--signal-foreground)" strokeWidth="3" strokeLinecap="round" />
        {Array.from({ length: 15 }).map((_, i) => (
          <circle key={i} cx={235 + (i % 5) * 34} cy={90 + Math.floor(i / 5) * 60} r="9" fill="currentColor" fillOpacity="0.22" />
        ))}
      </svg>
    </div>
  );
}

/** A phone turning speech into subtitles, sentence by sentence. */
export function PhoneScene() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => x + 1), 4200);
    return () => clearInterval(id);
  }, []);
  const line = DEMO_SCRIPT[i % DEMO_SCRIPT.length]!;
  return (
    <div className="grid h-full w-full place-items-center p-6">
      <div className="w-56 rounded-[2rem] border-4 border-ink-foreground/80 bg-ink p-4 shadow-panel sm:w-60">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-foreground/30" />
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-foreground/60"><Waveform bars={4} className="h-3 text-signal" /> Listening</p>
        <p key={`o${i}`} className="rise mt-3 min-h-[3.4rem] text-sm leading-snug text-ink-foreground">{line.en}</p>
        <div className="my-3 h-px bg-ink-foreground/15" />
        <p key={`t${i}`} className="rise d-3 min-h-[3.4rem] text-sm leading-snug text-signal">{line.fr}</p>
      </div>
    </div>
  );
}

/** A room where everyone is lit once understood. */
export function RoomScene({ image }: { image: string }) {
  return (
    <div className="relative h-full w-full">
      <div className="photo-duo absolute inset-0"><img src={image} alt="" loading="lazy" /></div>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2.5 bg-gradient-to-t from-ink via-ink/80 to-transparent px-6 pb-6 pt-16" aria-hidden>
        {Array.from({ length: 21 }).map((_, i) => (
          <span key={i} className="dot-light h-3 w-3 rounded-full" style={{ ["--i" as string]: i }} />
        ))}
      </div>
    </div>
  );
}

/** Looping live-caption preview used beside the sign-in forms. */
export function CaptionLoop() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<0 | 1>(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase(1); return; }
    const a = setTimeout(() => setPhase(1), 1500);
    const b = setTimeout(() => { setPhase(0); setI((x) => x + 1); }, 5200);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [i]);
  const line = DEMO_SCRIPT[i % DEMO_SCRIPT.length]!;
  return (
    <div className="rounded-2xl border border-ink-foreground/15 bg-ink/70 p-5 backdrop-blur">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-foreground/60"><Waveform bars={4} className="h-3 text-signal" /> Preview</p>
      <p key={`o${i}`} className="rise mt-3 text-lg leading-snug">{line.en}</p>
      <p key={`t${i}${phase}`} className={`mt-3 text-lg leading-snug text-signal transition-opacity duration-500 ${phase ? "rise opacity-100" : "opacity-0"}`}>{line.yo}</p>
    </div>
  );
}
