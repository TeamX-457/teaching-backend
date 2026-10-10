import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { PageHeader } from "@/components/vv/primitives";
import { ProblemBanner } from "@/components/vv/fields";
import { useLanguages } from "@/lib/auth";

export const Route = createFileRoute("/app/languages")({
  head: () => ({ meta: [{ title: "Languages — Voice Verse" }] }),
  component: Languages,
});

const Mark = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className="inline-flex items-center gap-1.5 text-sm" aria-label={`${label}: ${ok ? "available" : "not available yet"}`}>
    {ok ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground/50" />}
    <span className={ok ? "" : "text-muted-foreground"}>{ok ? "Available" : "Not yet"}</span>
  </span>
);

function Languages() {
  const { data, isPending, isError } = useLanguages();
  return (
    <>
      <PageHeader title="Languages" description="What each language can do today. New languages are added in one place and appear everywhere." />
      {isError && <ProblemBanner title="Can't load languages" body="Check your connection and reload." />}
      {data && !data.translationProviderConfigured && (
        <div className="mb-6"><ProblemBanner title="Translation isn't available yet" body="Subtitles work now. Voice Verse can't translate between languages until a translation service is connected." /></div>
      )}
      {isPending ? <div className="shimmer h-64 rounded-xl" /> : data && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr] gap-4 border-b bg-secondary/50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Language</span><span>Hear speech</span><span>Translate into</span><span>Speak aloud</span>
          </div>
          <ul className="divide-y">
            {data.languages.map((l, i) => (
              <li key={l.code} className="rise grid gap-2 px-5 py-4 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:items-center md:gap-4" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="font-medium">{l.name} <span className="ml-1 font-mono text-xs text-muted-foreground">{l.code}</span></span>
                <Mark ok={l.speechRecognition.supported} label="Hear speech" />
                <Mark ok={l.translation} label="Translate into" />
                <Mark ok={l.textToSpeech.supported} label="Speak aloud" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
