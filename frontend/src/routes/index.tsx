import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mic, Captions, Languages, Volume2, Church, GraduationCap, Building2, Presentation, ShieldCheck, Accessibility, Clock3, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroDemo } from "@/components/vv/HeroDemo";
import { Reveal } from "@/components/vv/primitives";
import { SiteFooter, SiteHeader } from "@/components/vv/SiteChrome";
import audience from "@/assets/audience.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Verse — Live speech, subtitles and translation" },
      { name: "description", content: "Voice Verse listens to live speech and delivers real-time subtitles, translation and spoken audio so everyone in the room can follow." },
      { property: "og:title", content: "Voice Verse — Live speech, subtitles and translation" },
      { property: "og:description", content: "Real-time subtitles, translation and audio for schools, churches, conferences and public services." },
    ],
  }),
  component: Landing,
});

const steps = [
  { icon: Mic, title: "Listen", body: "Voice Verse captures the speaker through any microphone, with no special hardware." },
  { icon: Captions, title: "Understand", body: "Speech becomes accurate, punctuated subtitles within a fraction of a second." },
  { icon: Languages, title: "Translate", body: "Each sentence is translated into the listener's chosen language as it is spoken." },
  { icon: Volume2, title: "Deliver", body: "Listeners read along or hear a natural spoken voice through their own headphones." },
];

const uses = [
  { icon: Church, title: "Places of worship", body: "Let every member of the congregation follow the service in their own language." },
  { icon: GraduationCap, title: "Schools & universities", body: "Lectures and parent meetings that include students and families equally." },
  { icon: Presentation, title: "Conferences", body: "Multilingual sessions without booths, interpreters' schedules or rental gear." },
  { icon: Building2, title: "Public institutions", body: "Town halls, clinics and service desks that communicate clearly with every citizen." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 md:pt-24">
        <div className="max-w-3xl">
          <p className="rise d-1 mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Real-time accessibility for live speech
          </p>
          <h1 className="rise d-2 font-display text-[44px] leading-[1.04] tracking-[-0.025em] sm:text-6xl md:text-[72px]">
            Every voice in the room, <em className="text-primary">understood.</em>
          </h1>
          <p className="rise d-3 mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Voice Verse turns live speech into subtitles, translation and spoken audio — instantly, on the devices people already carry.
          </p>
          <div className="rise d-4 mt-9 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="/signup">Start listening <ArrowRight /></a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how">See how it works</a>
            </Button>
          </div>
        </div>
        <div className="rise d-5 mt-14">
          <HeroDemo />
        </div>
      </section>

      <section id="how" className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How it works</p>
            <h2 className="mt-3 font-display text-4xl leading-tight">From voice to understanding, in under a second.</h2>
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 70} className="bg-card p-7">
                <div className="flex items-center justify-between">
                  <s.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-10 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="use" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <img src={audience} alt="A conference attendee reading live subtitles on her phone with one earpiece in" width={1408} height={1024} loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
          </Reveal>
          <div>
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Who it's for</p>
              <h2 className="mt-3 font-display text-4xl leading-tight">Built for the places where people gather.</h2>
            </Reveal>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {uses.map((u, i) => (
                <Reveal key={u.title} delay={i * 60}>
                  <div className="card-hover h-full rounded-xl border bg-card p-5">
                    <u.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                    <h3 className="mt-4 font-medium">{u.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{u.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="bg-ink text-ink-foreground">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">Accessibility first</p>
            <h2 className="mt-3 font-display text-4xl leading-tight">Designed with the people who depend on it.</h2>
            <p className="mt-5 max-w-md opacity-70">Accessibility is not a settings page. It shapes every decision — from text size and contrast to how gently the interface moves.</p>
          </Reveal>
          <div className="grid gap-8 sm:grid-cols-2">
            {[
              [Accessibility, "Readable by default", "Large, adjustable subtitles with clear contrast and screen-reader structure."],
              [Clock3, "Low latency", "Sentences appear as they are spoken, so nobody falls behind the room."],
              [Headphones, "Listen privately", "Translated audio plays through each listener's own headphones."],
              [ShieldCheck, "Private by design", "You control how long sessions are kept, and can delete them at any time."],
            ].map(([Icon, t, b], i) => {
              const I = Icon as typeof Mic;
              return (
                <Reveal key={t as string} delay={i * 60} className="border-t border-ink-foreground/15 pt-5">
                  <I className="h-5 w-5 opacity-80" strokeWidth={1.75} />
                  <h3 className="mt-4 font-medium">{t as string}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed opacity-65">{b as string}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <Reveal>
          <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight sm:text-5xl">Make your next gathering understood by everyone.</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">Set up in minutes. No interpreters' booths, no rented equipment.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild><a href="/signup">Create your account <ArrowRight /></a></Button>
            <Button size="lg" variant="outline" asChild><a href="/login">Sign in</a></Button>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
