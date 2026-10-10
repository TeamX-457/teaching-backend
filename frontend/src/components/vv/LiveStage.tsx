import { Mic, Languages } from "lucide-react";
import { Waveform } from "./primitives";
import { STAGE_LABEL, type Stage } from "@/lib/listening";
import { cn } from "@/lib/utils";

const FLOW: Stage[] = ["listening", "processing", "translating", "speaking"];

/** Status row: always tells the user what the app is doing right now. */
export function StageChips({ stage }: { stage: Stage }) {
  const idx = FLOW.indexOf(stage);
  const terminal = idx === -1;
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Session status">
      {terminal ? (
        <li className={cn("rounded-full px-2.5 py-1 font-medium transition-colors duration-300",
          stage === "error" ? "bg-destructive text-destructive-foreground" : stage === "completed" ? "bg-success text-white" : "bg-secondary text-foreground")}>
          {STAGE_LABEL[stage]}
        </li>
      ) : (
        FLOW.map((s, i) => (
          <li key={s} className={cn("rounded-full px-2.5 py-1 transition-colors duration-300",
            i === idx ? "bg-primary text-primary-foreground" : "text-muted-foreground/60")}>
            {STAGE_LABEL[s]}
          </li>
        ))
      )}
    </ol>
  );
}

type Props = {
  stage: Stage;
  fromName: string;
  toName: string;
  /** current sentence being spoken (partial) or the latest completed one */
  original: string;
  translated: string;
  previousOriginal?: string | undefined;
  previousTranslated?: string | undefined;
  live: boolean;
  showTranslation: boolean;
  translationPending: boolean;
  subtitleSize: number;
  title?: string;
  right?: React.ReactNode;
};

/** The visual centre of the product: what was said vs. what it means. Readable at a distance. */
export function LiveStage(p: Props) {
  const size = { fontSize: `${p.subtitleSize}px` };
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5 text-sm">
          <span className={cn("relative grid h-7 w-7 shrink-0 place-items-center rounded-full", p.live ? "bg-signal/12 text-signal" : "bg-secondary text-muted-foreground")}>
            {p.live && <span className="breathe absolute inset-0 rounded-full bg-signal/30" />}
            <Mic className="relative h-3.5 w-3.5" />
          </span>
          <span className="truncate font-medium">{p.title ?? "Live session"}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="rounded border px-1.5 py-0.5">{p.fromName}</span>
          {p.showTranslation && <>→<span className="rounded border border-primary/30 bg-accent px-1.5 py-0.5 text-accent-foreground">{p.toName}</span></>}
          {p.right}
        </div>
      </div>

      <div className={cn("grid gap-px bg-border", p.showTranslation && "md:grid-cols-2")}>
        <div className="bg-card p-5" aria-live="polite">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Waveform active={p.stage === "listening"} bars={4} className="h-3 text-signal" /> What the speaker said · {p.fromName}
          </p>
          {p.previousOriginal && <p className="mb-3 line-clamp-1 text-sm text-muted-foreground/70">{p.previousOriginal}</p>}
          <p className="min-h-[7rem] leading-snug" style={size}>
            {p.original || <span className="text-muted-foreground/60">{p.live ? "Waiting for speech…" : "Nothing yet."}</span>}
            {p.live && p.original && <span className="caret ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-1 bg-foreground" />}
          </p>
        </div>
        {p.showTranslation && (
          <div className="bg-card p-5" aria-live="polite">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Languages className="h-3.5 w-3.5" /> Translation · {p.toName}
            </p>
            {p.previousTranslated && <p className="mb-3 line-clamp-1 text-sm text-muted-foreground/70">{p.previousTranslated}</p>}
            <div className="min-h-[7rem]">
              {p.translated ? (
                <p key={p.translated} className="rise leading-snug text-primary" style={size}>{p.translated}</p>
              ) : p.translationPending ? (
                <div className="space-y-2.5 pt-1" aria-label="Translating">
                  <div className="shimmer h-4 w-11/12 rounded" />
                  <div className="shimmer h-4 w-2/3 rounded" />
                </div>
              ) : (
                <p className="text-muted-foreground/60" style={{ fontSize: `${Math.max(14, p.subtitleSize * 0.7)}px` }}>
                  Translated text appears here.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-5 py-3">
        <StageChips stage={p.stage} />
      </div>
    </div>
  );
}
