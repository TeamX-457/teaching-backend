import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const reduced = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion"));

/** Headline whose words un-blur one after another (CSS only, so it also works before JS). */
export function Words({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={cn("words", className)} aria-label={text} style={{ ["--d" as string]: `${delay}ms` } as CSSProperties}>
      {text.split(" ").map((w, i, a) => (
        <span key={i} className="w" aria-hidden style={{ ["--i" as string]: i } as CSSProperties}>{w}{i < a.length - 1 ? " " : ""}</span>
      ))}
    </span>
  );
}

/** Number that counts up the first time it scrolls into view. */
export function CountUp({ to, className, duration = 1300 }: { to: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to); // SSR and no-JS show the real value
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    setN(0);
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref} className={cn("tabular-nums", className)}>{n}</span>;
}

export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = items.map((t) => (
    <span key={t} className="flex items-center gap-10 whitespace-nowrap pr-10 font-display text-2xl text-muted-foreground sm:text-3xl">
      {t}<span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
    </span>
  ));
  return (
    <div className={cn("marquee overflow-hidden", className)} aria-hidden>
      <div className="marquee-track">{row}{row}</div>
    </div>
  );
}

/** Card whose highlight follows the pointer. */
export function Spot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("spot rounded-2xl border bg-card", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/** Wraps a button so it drifts a few pixels toward the cursor. */
export function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      className="magnetic"
      onPointerMove={(e) => {
        if (reduced() || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) / r.width;
        const y = (e.clientY - (r.top + r.height / 2)) / r.height;
        ref.current.style.transform = `translate(${x * 10}px, ${y * 8}px)`;
      }}
      onPointerLeave={() => { if (ref.current) ref.current.style.transform = ""; }}
    >
      {children}
    </span>
  );
}

/** Atmosphere behind a hero: faint grid and a glow that follows the cursor. */
export function HeroAtmosphere({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("relative", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--hx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--hy", `${e.clientY - r.top}px`);
      }}
    >
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );
}

export type Chapter = { kicker: string; title: string; body: string };

/**
 * Sticky story: chapters scroll on the left, a stage stays put and cross-fades its layers.
 * On small screens the stage is hidden and each chapter shows its own layer inline.
 */
export function StoryStage({ chapters, layers }: { chapters: Chapter[]; layers: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset["i"]));
    }, { rootMargin: "-42% 0px -42% 0px" });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="relative flex gap-6">
        <div className="story-rail hidden shrink-0 rounded-full lg:block" style={{ ["--p" as string]: (active + 1) / chapters.length, backgroundSize: `2px ${((active + 1) / chapters.length) * 100}%` } as CSSProperties} aria-hidden />
        <ol className="space-y-24 py-16 lg:space-y-[70vh] lg:py-[18vh]">
          {chapters.map((c, i) => (
            <li key={c.title} data-i={i} ref={(el) => { refs.current[i] = el; }} className={cn("transition-opacity duration-500", active === i ? "opacity-100" : "lg:opacity-40")}>
              <p className="font-mono text-xs uppercase tracking-widest opacity-60">{c.kicker}</p>
              <h3 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{c.title}</h3>
              <p className="mt-4 max-w-md text-lg leading-relaxed opacity-70">{c.body}</p>
              <div className="mt-8 aspect-[4/3] overflow-hidden rounded-2xl border border-ink-foreground/15 bg-ink-foreground/5 lg:hidden">{layers[i]}</div>
            </li>
          ))}
        </ol>
      </div>
      <div className="hidden lg:block">
        <div data-active={active} className="sticky top-24 aspect-[4/3] overflow-hidden rounded-3xl border border-ink-foreground/15 bg-ink-foreground/5 shadow-panel">
          {layers.map((l, i) => (
            <div key={i} data-layer={i} className="story-layer absolute inset-0">{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
