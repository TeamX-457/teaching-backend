import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecodeWord, FilmFrame, FocusSlider, TryPanel, VenuePlans } from "@/components/vv/landing";
import { JoinForm } from "@/components/vv/JoinForm";
import { Reveal } from "@/components/vv/primitives";
import { PhoneScene, RoomScene, SoundScene } from "@/components/vv/scenes";
import { SiteFooter, SiteHeader } from "@/components/vv/SiteChrome";
import { Words } from "@/components/vv/story";
import { useLanguages } from "@/lib/auth";
import audience from "@/assets/audience.jpg";

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

      {/* 1. The page itself is the product */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-14 md:pt-20">
        <p className="rise d-1 mb-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">Live speech, in words you can follow</p>
        <h1 className="font-display text-[44px] leading-[1.03] tracking-[-0.025em] sm:text-6xl md:text-[84px]">
          <Words text="Every voice in the room," /><br />
          <em className="text-primary not-italic sm:italic"><DecodeWord words={UNDERSTOOD} /></em>
        </h1>
        <div className="rise d-4 mt-12">
          {data ? <TryPanel langs={data.languages} providerReady={data.translationProviderConfigured} /> : <div className="shimmer h-80 rounded-3xl" aria-label="Loading" />}
        </div>
      </section>

      {/* 2. What not following feels like */}
      <section className="border-y bg-card">
        <div className="mx-auto max-w-5xl px-5 py-24">
          <Reveal>
            <p className="mb-8 font-mono text-xs uppercase tracking-widest text-muted-foreground">What a room can sound like</p>
            <FocusSlider />
          </Reveal>
        </div>
      </section>

      {/* 3. The story, told as subtitles */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="mb-12 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How it works</p>
          <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Three moments. Read along.</h2>
        </Reveal>
        <div className="space-y-6">
          <Reveal><FilmFrame en="Someone speaks." fr="Quelqu'un parle." note="A speaker's voice spreading through a room"><SoundScene /></FilmFrame></Reveal>
          <Reveal><FilmFrame en="Words appear, a moment later." fr="Les mots apparaissent, un instant plus tard." note="A phone showing live subtitles"><PhoneScene /></FilmFrame></Reveal>
          <Reveal><FilmFrame en="And the whole room follows." fr="Et toute la salle suit." note="An audience following along"><RoomScene image={audience} /></FilmFrame></Reveal>
        </div>
      </section>

      {/* 4. The same people, different rooms */}
      <section id="use" className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal className="mb-12 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Wherever people gather</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Built for the room you are in.</h2>
          </Reveal>
          <Reveal><VenuePlans /></Reveal>
        </div>
      </section>

      {/* 5. Close with something to do */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-5xl leading-tight sm:text-6xl">Say something.</h2>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">Join a room with a code, or start your own. No one has to ask what was said.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><a href="/signup">Create an account <ArrowRight /></a></Button>
              <Button size="lg" variant="outline" asChild><a href="/about">Our story</a></Button>
            </div>
          </Reveal>
          <Reveal delay={120}><JoinForm /></Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
