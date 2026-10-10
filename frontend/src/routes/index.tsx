import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, EyeOff, Headphones, Languages, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroDemo } from "@/components/vv/HeroDemo";
import { Reveal } from "@/components/vv/primitives";
import { PhoneScene, RoomScene, SoundScene } from "@/components/vv/scenes";
import { SiteFooter, SiteHeader } from "@/components/vv/SiteChrome";
import { CountUp, HeroAtmosphere, Magnetic, Marquee, Spot, StoryStage, Words } from "@/components/vv/story";
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

const PLACES = ["Classrooms", "Churches", "Conferences", "Town halls", "Clinics", "Lectures", "Sermons", "Community meetings"];

const CHAPTERS = [
  { kicker: "01 · A voice", title: "Someone speaks.", body: "A teacher, a pastor, a chairperson. Nothing changes for them. They simply talk." },
  { kicker: "02 · The words", title: "Words appear.", body: "Each sentence becomes subtitles on the phone in your hand, a moment after it is said." },
  { kicker: "03 · The room", title: "Everyone follows.", body: "Read along, choose your language, or listen privately. Nobody is left out of the room." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <HeroAtmosphere className="overflow-hidden">
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 md:pt-24">
          <div className="max-w-3xl">
            <p className="rise d-1 mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Real-time accessibility for live speech
            </p>
            <h1 className="font-display text-[44px] leading-[1.04] tracking-[-0.025em] sm:text-6xl md:text-[76px]">
              <Words text="Every voice in the room," /> <em className="text-primary not-italic sm:italic"><Words text="understood." delay={420} /></em>
            </h1>
            <p className="rise d-4 mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Live speech becomes subtitles, translation and spoken audio, on the phones people already carry.
            </p>
            <div className="rise d-5 mt-9 flex flex-wrap items-center gap-3">
              <Magnetic>
                <Button size="lg" asChild><a href="/signup">Start listening <ArrowRight /></a></Button>
              </Magnetic>
              <Button size="lg" variant="outline" asChild><a href="/join">Join with a code</a></Button>
            </div>
          </div>
          <div className="rise d-5 mt-14"><HeroDemo /></div>
        </section>
      </HeroAtmosphere>

      {/* Where it happens */}
      <section className="border-y bg-card py-7" aria-label="Where Voice Verse is used">
        <Marquee items={PLACES} />
      </section>

      {/* The story */}
      <section id="how" className="bg-ink text-ink-foreground">
        <div className="mx-auto max-w-6xl px-5 pb-4 pt-24">
          <Reveal className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">How it works</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">From a voice to a room that understands.</h2>
          </Reveal>
        </div>
        <StoryStage
          chapters={CHAPTERS}
          layers={[<SoundScene key="s" />, <PhoneScene key="p" />, <RoomScene key="r" image={audience} />]}
        />
      </section>

      {/* Three promises, each shown rather than described */}
      <section id="use" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Made for people</p>
          <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Built so nobody has to ask what was said.</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: Mic, title: "Subtitles first", body: "Large, calm text you can read from across the room.", scene: (
              <div className="space-y-2" aria-hidden>{[88, 64, 76].map((w, i) => <div key={i} className="h-2.5 rounded-full bg-primary/25" style={{ width: `${w}%` }} />)}</div>) },
            { icon: Languages, title: "In your language", body: "English, French, Spanish, Yorùbá, Hausa, Igbo and Ibibio are on the way, one sentence at a time.", scene: (
              <div className="flex flex-wrap gap-1.5" aria-hidden>{["EN", "FR", "ES", "YO", "HA", "IG", "IBB"].map((c) => <span key={c} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{c}</span>)}</div>) },
            { icon: EyeOff, title: "Private by design", body: "Audio is processed as you listen and never stored. Sessions are kept on your device.", scene: (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-hidden><Headphones className="h-4 w-4" /> Audio recordings kept: <b className="text-foreground">0</b></div>) },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <Spot className="h-full p-6">
                <f.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                <h3 className="mt-6 text-lg font-medium">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                <div className="mt-6">{f.scene}</div>
              </Spot>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Facts: only things that are true of the product */}
      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:grid-cols-3">
          {[
            [7, "languages in the app"],
            [6, "characters to join a session"],
            [0, "recordings kept"],
          ].map(([n, l], i) => (
            <Reveal key={l as string} delay={i * 80}>
              <p className="font-display text-6xl text-primary"><CountUp to={n as number} /></p>
              <p className="mt-1 text-sm text-muted-foreground">{l as string}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <Reveal>
          <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight sm:text-5xl">Make your next gathering understood by everyone.</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">Open it on a phone, press start, and let the room follow along.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Magnetic><Button size="lg" asChild><a href="/signup">Create your account <ArrowRight /></a></Button></Magnetic>
            <Button size="lg" variant="outline" asChild><a href="/about">Our story</a></Button>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
