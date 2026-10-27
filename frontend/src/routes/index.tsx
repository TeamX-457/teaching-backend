import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecodeWord, FilmFrame, FocusSlider, TryPanel, VenuePlans } from "@/components/vv/landing";
import { JoinForm } from "@/components/vv/JoinForm";
import { Photo } from "@/components/vv/photos";
import { Reveal } from "@/components/vv/primitives";
import { SoundScene } from "@/components/vv/scenes";
import { SiteFooter, SiteHeader } from "@/components/vv/SiteChrome";
import { Words } from "@/components/vv/story";
import { useLanguages } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Verse — Live speech, subtitles and translation" },
      { name: "description", content: "Speak to the page and watch your words become subtitles. Voice Verse turns live speech into subtitles and translation for classrooms, churches, conferences and town halls." },
      { property: "og:title", content: "Voice Verse — Every voice in the room, understood" },
      { property: "og:description", content: "Real-time subtitles and translation on the phone in your hand." },
    ],
  }),
  component: Landing,
});

const UNDERSTOOD = ["understood.", "compris.", "entendido.", "verstanden.", "an fahimta."];

function Landing() {
  const { data } = useLanguages();
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* 1. The page is the product, with real rooms beside it */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 md:pt-16">
        <div className="grid items-center gap-10 md:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="rise d-1 mb-5 font-mono text-xs uppercase tracking-widest text-muted-foreground">Live speech, in words you can follow</p>
            <h1 className="font-display text-[34px] leading-[1.06] tracking-[-0.02em] sm:text-5xl md:text-[56px]">
              <Words text="Every voice in the room," /><br />
              <em className="text-primary not-italic sm:italic"><DecodeWord words={UNDERSTOOD} /></em>
            </h1>
            <p className="rise d-4 mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Subtitles and translation for classrooms, churches, conferences and town halls, on the phone already in your hand.
            </p>
          </div>
          <div className="rise d-3 relative mx-auto hidden h-72 w-full max-w-sm md:block" aria-hidden>
            <div className="float absolute right-0 top-0 h-56 w-56 overflow-hidden rounded-3xl shadow-lift" style={{ ["--r" as string]: "3deg" }}><Photo name="classroom" priority /></div>
            <div className="float absolute bottom-0 left-0 h-44 w-60 overflow-hidden rounded-3xl border-4 border-background shadow-lift" style={{ ["--r" as string]: "-4deg", animationDelay: "1.2s" }}><Photo name="conference" priority /></div>
            <div className="absolute -right-2 bottom-8 grid h-14 w-14 place-items-center rounded-full bg-signal text-signal-foreground shadow-lift"><span className="breathe absolute inset-0 rounded-full bg-signal/40" /><span className="relative font-mono text-xs">CC</span></div>
          </div>
        </div>
        <div className="rise d-4 mt-10">
          {data ? <TryPanel langs={data.languages} providerReady={data.translationProviderConfigured} /> : <div className="shimmer h-72 rounded-3xl" aria-label="Loading" />}
        </div>
      </section>

      {/* 2. What not following feels like */}
      <section className="border-y bg-signal/[0.06]">
        <div className="mx-auto max-w-4xl px-5 py-20">
          <Reveal>
            <p className="mb-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">What a room can sound like</p>
            <FocusSlider />
          </Reveal>
        </div>
      </section>

      {/* 3. The story, told as subtitles over real rooms */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="mb-10 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How it works</p>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">Three moments. Read along.</h2>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          <Reveal>
            <FilmFrame stacked en="Someone speaks." fr="Quelqu'un parle." note="A teacher guiding students through a lesson">
              <Photo name="classroom" className="photo-warm" />
            </FilmFrame>
          </Reveal>
          <Reveal delay={90}>
            <FilmFrame stacked en="Words appear, a moment later." fr="Les mots apparaissent, un instant plus tard." note="Live subtitles spreading through a hall">
              <div className="relative h-full w-full bg-ink"><Photo name="speaker" className="photo-warm opacity-60" /><div className="absolute inset-0"><SoundScene /></div></div>
            </FilmFrame>
          </Reveal>
          <Reveal delay={180}>
            <FilmFrame stacked en="And the whole room follows." fr="Et toute la salle suit." note="A full lecture hall of delegates">
              <Photo name="conference" className="photo-warm" />
            </FilmFrame>
          </Reveal>
        </div>
      </section>

      {/* 4. The same people, different rooms */}
      <section id="use" className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal className="mb-10 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Wherever people gather</p>
            <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">Built for the room you are in.</h2>
          </Reveal>
          <Reveal><VenuePlans /></Reveal>
        </div>
      </section>

      {/* 5. Close with something to do */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">Say something.</h2>
            <p className="mt-4 max-w-md text-base text-muted-foreground">Join a room with a code, or start your own. No one has to ask what was said.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" asChild><a href="/signup">Create an account <ArrowRight /></a></Button>
              <Button size="lg" variant="outline" asChild><a href="/download"><Smartphone /> Get the Android app</a></Button>
              <Button size="lg" variant="ghost" asChild><a href="/pricing">See pricing</a></Button>
            </div>
          </Reveal>
          <Reveal delay={120}><JoinForm /></Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
