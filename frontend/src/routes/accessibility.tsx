import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, Prose } from "@/components/vv/PublicPage";

export const Route = createFileRoute("/accessibility")({
  head: () => ({ meta: [{ title: "Accessibility — Voice Verse" }] }),
  component: () => (
    <PublicPage eyebrow="Accessibility" title="Designed for the people who depend on it." lead="Accessibility is the product, not a setting. Here is what is in place today, and where it falls short.">
      <Prose>
        <h2>What works today</h2>
        <ul>
          <li><strong>Readable text.</strong> Subtitle size is adjustable up to very large, and the interface text can be enlarged in Settings.</li>
          <li><strong>High contrast and dark mode.</strong> Both are available and remembered on your device.</li>
          <li><strong>Reduced motion.</strong> Turn animations off in Settings, or let your device's setting apply. Every fact is still shown.</li>
          <li><strong>Keyboard and screen readers.</strong> Controls are labelled, focus is visible, and status changes are announced.</li>
          <li><strong>Subtitles and audio.</strong> Read the words, or hear the translation through your own earphones where your device has a voice for that language.</li>
        </ul>
        <h2>Known limits</h2>
        <ul>
          <li>Listening works in Chrome and Edge. Other browsers cannot turn speech into text.</li>
          <li>Ibibio, Yorùbá, Hausa and Igbo speech cannot be recognised by browsers yet, so they work as <em>output</em> languages only, and only once a translation service is connected.</li>
          <li>Spoken output depends on voices installed on your device, so some languages show text only.</li>
          <li>Accuracy drops in noisy rooms or when the microphone is far from the speaker.</li>
        </ul>
        <h2>Tell us what's wrong</h2>
        <p>If something blocks you, <a href="/contact" className="text-primary underline underline-offset-4">contact us</a> and choose "An accessibility problem".</p>
      </Prose>
    </PublicPage>
  ),
});
