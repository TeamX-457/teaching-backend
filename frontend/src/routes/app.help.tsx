import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader } from "@/components/vv/primitives";

export const Route = createFileRoute("/app/help")({
  head: () => ({ meta: [{ title: "Help — Voice Verse" }] }),
  component: Help,
});

const FAQ = [
  ["How do I start?", "Choose Start listening, pick the language being spoken and the one you understand, and press Start. Hold your phone towards the speaker."],
  ["The microphone doesn't work.", "Click the lock or microphone icon in your browser's address bar and allow microphone access, then press Resume. Use Chrome or Edge; other browsers can't turn speech into text."],
  ["How do I follow a speaker's session?", "Ask the speaker for their code and choose Join a session. You don't need to speak, and listeners don't need an account when using the shared link."],
  ["Why is the translation missing?", "Translation needs a connected translation service. Until it is connected you'll see the original words with a notice. Subtitles always work."],
  ["Can I hear the translation?", "Turn on Speak the translation. It uses voices already on your device, so some languages can't be spoken yet. Use earphones in shared rooms."],
  ["Is my audio recorded?", "No. Audio is processed as you listen and never stored. Only text is kept, on your device, if you allow it in Settings."],
  ["How do I delete my sessions?", "Open History to delete one or all. You can also choose how long sessions are kept in Settings."],
];

function Help() {
  return (
    <>
      <PageHeader title="Help" description="Quick answers for listeners and speakers." />
      <Accordion type="single" collapsible className="rise max-w-2xl rounded-xl border bg-card px-5">
        {FAQ.map(([q, a], i) => (
          <AccordionItem key={q} value={`i${i}`}>
            <AccordionTrigger className="text-left">{q}</AccordionTrigger>
            <AccordionContent className="leading-relaxed text-muted-foreground">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}
