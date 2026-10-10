import { createFileRoute } from "@tanstack/react-router";
import { DraftNotice, PublicPage, Prose } from "@/components/vv/PublicPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — Voice Verse" }] }),
  component: () => (
    <PublicPage eyebrow="Terms" title="Using Voice Verse." lead="Short, plain terms for a product that is still in pilot.">
      <DraftNotice />
      <Prose>
        <h2>A prototype in pilot</h2>
        <p>Voice Verse is an early product. It may be unavailable at times, and its subtitles and translations may contain mistakes. Do not rely on it for medical, legal or safety-critical communication.</p>
        <h2>Using it fairly</h2>
        <ul>
          <li>Only record or caption speech when you have the right to, and tell people it is happening where that is expected.</li>
          <li>Do not use Voice Verse to harass, deceive or harm anyone, or to attempt to break the service.</li>
        </ul>
        <h2>Your account</h2>
        <p>Keep your password private. You are responsible for what is done with your account.</p>
        <h2>Content</h2>
        <p>You keep ownership of the words you speak and the sessions you create. We process them only to provide the service.</p>
        <h2>Changes</h2>
        <p>We may update these terms as the product grows. Continued use means you accept the updated terms.</p>
        <h2>Contact</h2>
        <p>Questions about these terms? <a href="/contact" className="text-primary underline underline-offset-4">Contact us</a>.</p>
      </Prose>
    </PublicPage>
  ),
});
