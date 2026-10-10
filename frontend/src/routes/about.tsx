import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPage } from "@/components/vv/PublicPage";
import { Reveal } from "@/components/vv/primitives";
import { Magnetic } from "@/components/vv/story";
import audience from "@/assets/audience.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About — Voice Verse" }, { name: "description", content: "Voice Verse is a student-built accessibility product from Voice First Company, a Junior Achievement Nigeria company in Akwa Ibom State." }] }),
  component: About,
});

const CHAPTERS = [
  ["The problem", "In a classroom, a church or a town hall, one person speaks and everyone is expected to keep up. If you can't follow the language, or can't hear well, you quietly fall behind."],
  ["The idea", "What if the phone in your pocket could show you what is being said, in words you understand, as it is said? No special equipment. No one asked to slow down."],
  ["Today", "Voice Verse is a working prototype in pilot. It turns live speech into subtitles, and translates sentence by sentence where a translation service is connected."],
  ["Next", "More Nigerian languages, starting with Ibibio, tested with real teachers, congregations and community leaders, and shaped by what they tell us."],
];

function About() {
  return (
    <PublicPage eyebrow="About" title="A small idea about being included." lead="Voice Verse exists so that no one is left out of a room because they cannot follow what is being said.">
      <Reveal>
        <div className="photo-duo aspect-[16/8] w-full rounded-3xl"><img src={audience} alt="An attendee reading live subtitles on her phone" loading="lazy" /></div>
      </Reveal>

      <ol className="mt-16 space-y-12 border-l pl-8">
        {CHAPTERS.map(([t, b], i) => (
          <Reveal key={t} delay={i * 60}>
            <li className="relative">
              <span className="absolute -left-[37px] top-2 h-3 w-3 rounded-full border-2 border-background bg-signal" aria-hidden />
              <h2 className="font-display text-3xl">{t}</h2>
              <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">{b}</p>
            </li>
          </Reveal>
        ))}
      </ol>

      <Reveal className="mt-20">
        <div className="rounded-2xl border bg-card p-8">
          <h2 className="font-display text-2xl">Who builds it</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Voice Verse is built by <strong className="text-foreground">Voice First Company</strong>, a student company in the Junior Achievement Nigeria
            Company Programme, at Community Secondary Commercial School, Ikot Ekpeyak Ikono, Uyo, Akwa Ibom State.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Magnetic><Button asChild><a href="/signup">Try it <ArrowRight /></a></Button></Magnetic>
            <Button variant="outline" asChild><a href="/contact">Talk to us</a></Button>
          </div>
        </div>
      </Reveal>
    </PublicPage>
  );
}
