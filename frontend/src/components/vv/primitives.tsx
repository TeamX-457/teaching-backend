import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <Link to="/" className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)} aria-label="Voice Verse home">
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg", inverted ? "bg-ink-foreground text-ink" : "bg-primary text-primary-foreground")}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
        </svg>
      </span>
      <span className="text-[17px]">Voice Verse</span>
    </Link>
  );
}

export function Waveform({ active = true, bars = 5, className }: { active?: boolean; bars?: number; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn("h-full w-[3px] rounded-full bg-current transition-transform duration-300", active ? "wave-bar" : "scale-y-[0.3]")}
          style={{ animationDelay: `${(i * 137) % 600}ms` }}
        />
      ))}
    </span>
  );
}

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { el.classList.add("is-visible"); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="fade-in flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
