import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Mic, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_SCRIPT } from "@/lib/languages";
import { api, type LangCfg } from "@/lib/api";
import { speechSupported, useRecognizer } from "@/lib/listening";
import { cn } from "@/lib/utils";
import { Waveform } from "./primitives";
import { Photo, type PhotoKey } from "./photos";
import { Words } from "./story";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion"));

/* ------------------------------------------------------------------ */
/* 1. The headline's last word resolves out of noise, in other languages */
/* ------------------------------------------------------------------ */
const NOISE = "abcdefghijklmnopqrstuvwxyzáéíóúàèùâêôçñüß";

export function DecodeWord({ words, className }: { words: string[]; className?: string }) {
  const [text, setText] = useState(words[0]!);
  const i = useRef(0);
  useEffect(() => {
    if (prefersReduced()) return;
    let raf = 0;
    const run = (to: string) => {
      const t0 = performance.now();
      const dur = 900;
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const settled = Math.floor(p * to.length);
        setText(to.split("").map((c, k) => (k < settled || c === "." || c === " " ? c : NOISE[Math.floor(Math.random() * NOISE.length)])).join(""));
        if (p < 1) raf = requestAnimationFrame(tick); else setText(to);
      };
      raf = requestAnimationFrame(tick);
    };
    const first = setTimeout(() => run(words[0]!), 700);
    const id = setInterval(() => { i.current = (i.current + 1) % words.length; run(words[i.current]!); }, 5200);
    return () => { clearTimeout(first); clearInterval(id); cancelAnimationFrame(raf); };
  }, [words]);
  return <span className={className} aria-label={words[0]}><span aria-hidden>{text}</span></span>;
}

/* ------------------------------------------------------------------ */
/* 2. The page listens: a real, private, in-browser captioning demo      */
/* ------------------------------------------------------------------ */
type Line = { id: number; text: string; tr: string | null; note: string | null };

export function TryPanel({ langs, providerReady }: { langs: LangCfg[]; providerReady: boolean }) {
  const outs = langs.filter((l) => l.code !== "en" && l.translation);
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [out, setOut] = useState("fr");
  const [size, setSize] = useState(1);
  const outRef = useRef(out);
  outRef.current = out;
  const supported = typeof window !== "undefined" ? speechSupported() : true;

  const rec = useRecognizer({
    locale: "en-NG",
    onPartial: setPartial,
    onFinal: async (text) => {
      const id = Date.now() + Math.random();
      setPartial("");
      setLines((l) => [...l.slice(-3), { id, text, tr: null, note: null }]);
      try {
        const r = await api.translate({ text, source: "en", target: outRef.current });
        setLines((l) => l.map((x) => (x.id === id ? { ...x, tr: r.translated ? r.text : null, note: r.translated ? null : "Can't translate this yet" } : x)));
      } catch {
        setLines((l) => l.map((x) => (x.id === id ? { ...x, note: "Can't translate right now" } : x)));
      }
    },
    onProblem: (p) => { setProblem(p.title); if (p.fatal) setOn(false); },
  });

  const toggle = useCallback(() => {
    if (on) { rec.stop(); setOn(false); setPartial(""); return; }
    setProblem(null);
    if (rec.start()) setOn(true);
  }, [on, rec]);

  // Idle: gently type sample sentences so the panel is alive before it is used.
  const idle = !on && lines.length === 0;
  const [demo, setDemo] = useState({ i: 0, n: 0 });
  useEffect(() => {
    if (!idle || prefersReduced()) return;
    const row = DEMO_SCRIPT[demo.i % DEMO_SCRIPT.length]!;
    const t = setTimeout(() => setDemo((d) => (d.n < row.en.length ? { ...d, n: d.n + 1 } : { i: d.i + 1, n: 0 })), demo.n < row.en.length ? 42 : 2600);
    return () => clearTimeout(t);
  }, [idle, demo]);
  const sample = DEMO_SCRIPT[demo.i % DEMO_SCRIPT.length]!;
  const sizes = ["text-lg sm:text-xl", "text-xl sm:text-3xl", "text-2xl sm:text-4xl"];
  const current = partial || lines[lines.length - 1]?.text || "";
  const last = lines[lines.length - 1];

  return (
    <div className="overflow-hidden rounded-3xl border bg-ink text-ink-foreground shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-foreground/10 px-5 py-3">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-foreground/60">
          <Waveform active={on} bars={5} className="h-3 text-signal" /> {on ? "Listening to you" : "This page can listen"}
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Caption size">
          <button aria-label="Smaller captions" onClick={() => setSize((s) => Math.max(0, s - 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-ink-foreground/10"><Minus className="h-4 w-4" /></button>
          <button aria-label="Larger captions" onClick={() => setSize((s) => Math.min(2, s + 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-ink-foreground/10"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="min-h-[15rem] px-6 py-8 sm:px-10 sm:py-10" aria-live="polite">
        {idle ? (
          <>
            <p className={cn("font-display leading-snug", sizes[size])}>{sample.en.slice(0, demo.n)}<span className="caret ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-1 bg-signal" /></p>
            <p className="mt-4 text-sm text-ink-foreground/50">A sample. Press the microphone and speak your own.</p>
          </>
        ) : (
          <>
            {lines.length > 1 && <p className="mb-3 text-base text-ink-foreground/45">{lines[lines.length - 2]!.text}</p>}
            <p className={cn("font-display leading-snug", sizes[size], partial && "opacity-80")}>{current || <span className="text-ink-foreground/40">Say something…</span>}</p>
            {last && !partial && (
              <p className={cn("mt-5 leading-snug", last.tr ? cn("rise font-display text-signal", size === 2 ? "text-3xl" : "text-2xl") : "text-sm text-ink-foreground/60")}>
                {last.tr ?? last.note ?? "Translating…"}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-foreground/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {supported ? (
            <Button size="lg" onClick={toggle} className={on ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-signal text-signal-foreground hover:bg-signal/90"}>
              {on ? <><Square /> Stop</> : <><Mic /> Speak to this page</>}
            </Button>
          ) : (
            <span className="text-sm text-ink-foreground/60">Live captions need Chrome or Edge.</span>
          )}
          {problem && <span role="alert" className="text-sm text-signal">{problem}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Translate into">
          <span className="mr-1 text-xs text-ink-foreground/50">Show in</span>
          {outs.map((l) => (
            <button key={l.code} role="radio" aria-checked={out === l.code} onClick={() => setOut(l.code)}
              className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", out === l.code ? "border-signal bg-signal text-signal-foreground" : "border-ink-foreground/20 text-ink-foreground/70 hover:border-ink-foreground/50")}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <p className="border-t border-ink-foreground/10 px-5 py-2.5 text-xs text-ink-foreground/45">
        Your voice stays in your browser and is never recorded by Voice Verse.{!providerReady && " Translation isn't connected yet, so it will say so."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Clarity: speech you can't follow sharpens as you slide             */
/* ------------------------------------------------------------------ */
const FOREIGN: Record<string, string> = {
  a: "ɑ", b: "ƀ", c: "ʂ", d: "ð", e: "ǝ", f: "ƒ", g: "ɠ", h: "ħ", i: "ɨ", j: "ʝ", k: "ĸ", l: "ɬ", m: "ɱ", n: "ŋ", o: "ø", p: "þ", q: "ƣ",
  r: "ɾ", s: "ʃ", t: "ŧ", u: "ʉ", v: "ʋ", w: "ɯ", x: "χ", y: "ɣ", z: "ʒ",
};
const scramble = (w: string) => w.replace(/[a-z]/gi, (c) => FOREIGN[c.toLowerCase()] ?? c);

const FOCUS_TEXT = "In every crowded room, someone is nodding along to words they cannot follow.";

export function FocusSlider() {
  const words = useMemo(() => FOCUS_TEXT.split(" "), []);
  const [level, setLevel] = useState(14);
  const shown = Math.round((level / 100) * words.length);
  const ref = useRef<HTMLDivElement>(null);

  // First time it scrolls into view it sharpens a little by itself, to show what the slider does.
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      let v = 14;
      const id = setInterval(() => { v += 2; setLevel((cur) => (cur > v ? cur : v)); if (v >= 34) clearInterval(id); }, 60);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <p className="font-display text-2xl leading-snug sm:text-4xl" aria-label={FOCUS_TEXT}>
        {words.map((w, i) => {
          const clear = i < shown;
          return (
            <span key={i} aria-hidden className={cn("inline-block transition-[filter,opacity,color] duration-500", clear ? "text-foreground" : "text-muted-foreground/70 blur-[1.5px]")} style={{ transitionDelay: `${Math.min(i, 12) * 20}ms` }}>
              {clear ? w : scramble(w)}&nbsp;
            </span>
          );
        })}
      </p>
      <div className="mt-10 max-w-md">
        <label htmlFor="understand" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">How much of it you understand</span>
          <span className="font-mono text-xs text-muted-foreground">{level}%</span>
        </label>
        <input id="understand" type="range" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[var(--primary)]" />
        <p className={cn("mt-5 text-lg transition-opacity duration-500", level >= 96 ? "opacity-100" : "opacity-0")} aria-live="polite">
          That slider is Voice Verse.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Floor plans that rearrange: the same people, different rooms      */
/* ------------------------------------------------------------------ */
type Pt = [number, number];
const N = 36;
const grid = (): Pt[] => Array.from({ length: N }, (_, i) => [60 + (i % 9) * 35, 90 + Math.floor(i / 9) * 34] as Pt);
const pews = (): Pt[] => Array.from({ length: N }, (_, i) => {
  const side = i < 18 ? 0 : 1, k = i % 18, c = k % 3, r = Math.floor(k / 3);
  return [(side ? 232 : 56) + c * 36, 84 + r * 28] as Pt;
});
const tables = (): Pt[] => Array.from({ length: N }, (_, i) => {
  const t = Math.floor(i / 6), s = i % 6, cx = 80 + (t % 3) * 120, cy = 100 + Math.floor(t / 3) * 84;
  return [cx + Math.cos((s / 6) * Math.PI * 2) * 26, cy + Math.sin((s / 6) * Math.PI * 2) * 26] as Pt;
});
const arcs = (): Pt[] => {
  const out: Pt[] = [];
  [10, 12, 14].forEach((n, ring) => {
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.12 + (0.76 * k) / (n - 1));
      out.push([200 + Math.cos(a) * (70 + ring * 38) * -1, 70 + Math.sin(a) * (70 + ring * 36)]);
    }
  });
  return out.slice(0, N);
};

const VENUES = [
  { key: "classroom", photo: "classroom" as PhotoKey, label: "Classroom", line: "A lesson in a language you are still learning.", seats: grid(), stage: [200, 36] as Pt },
  { key: "church", photo: "church" as PhotoKey, label: "Church", line: "A sermon, a prayer, a hymn, followed by everyone in the pews.", seats: pews(), stage: [200, 36] as Pt },
  { key: "conference", photo: "conference" as PhotoKey, label: "Conference", line: "Round tables, many mother tongues, one conversation.", seats: tables(), stage: [200, 30] as Pt },
  { key: "town", photo: "community" as PhotoKey, label: "Town hall", line: "A community decision that belongs to the whole community.", seats: arcs(), stage: [200, 24] as Pt },
] as const;

export function VenuePlans() {
  const [v, setV] = useState(0);
  const [flip, setFlip] = useState(0);
  const venue = VENUES[v]!;
  const pick = (i: number) => { setV(i); setFlip((f) => 1 - f); };
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Venue">
          {VENUES.map((x, i) => (
            <button key={x.key} role="tab" aria-selected={v === i} onClick={() => pick(i)}
              className={cn("rounded-full border px-4 py-2 text-sm transition-all duration-300", v === i ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
              {x.label}
            </button>
          ))}
        </div>
        <p key={venue.key} className="rise mt-8 font-display text-2xl leading-snug sm:text-3xl">{venue.line}</p>
        <p className="mt-4 text-muted-foreground">Same microphone. Same phone in your hand. Every seat lights up when its person is following.</p>
      </div>
      <div className="plan overflow-hidden rounded-3xl border bg-card" data-flip={flip}>
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-ink">
          <div key={venue.key} className="fade-in absolute inset-0"><Photo name={venue.photo} className="photo-warm" /></div>
        </div>
        <svg viewBox="0 0 400 240" className="h-auto w-full p-4" role="img" aria-label={`Seating plan of a ${venue.label.toLowerCase()}`}>
          <g className="stage" style={{ transform: `translate(${venue.stage[0]}px, ${venue.stage[1]}px)` }}>
            <rect x="-34" y="-9" width="68" height="18" rx="9" fill="var(--signal)" />
          </g>
          {venue.seats.map(([x, y], i) => (
            <g key={i} className="seat-g" style={{ transform: `translate(${x}px, ${y}px)` }}>
              <circle className="seat" r="7" style={{ ["--i" as string]: i }} />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. A film frame with subtitles: the story told in its own medium      */
/* ------------------------------------------------------------------ */
export function FilmFrame({ children, en, fr, note, stacked }: { children: React.ReactNode; en: string; fr: string; note: string; stacked?: boolean }) {
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <figure ref={ref} className="overflow-hidden rounded-3xl bg-ink text-ink-foreground">
      <div className={cn("relative w-full", stacked ? "aspect-[4/5]" : "aspect-[4/3] sm:aspect-[21/9]")}>
        <div className="absolute inset-0">{children}</div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-5 pt-20 text-center">
          {seen ? (
            <>
              <p className="font-display text-xl text-white sm:text-2xl"><Words text={en} /></p>
              <p className="rise d-5 mt-1.5 text-sm text-signal">{fr}</p>
            </>
          ) : <p className="font-display text-xl text-transparent sm:text-2xl" aria-hidden>{en}</p>}
        </div>
      </div>
      <figcaption className="sr-only">{note}</figcaption>
    </figure>
  );
}
