import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, Prose } from "@/components/vv/PublicPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms — Voice Verse" }] }),
  component: () => (
    <PublicPage eyebrow="Terms" title="Using Voice Verse." lead="Short, plain terms for a product that is still in pilot.">
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
        <h2>Payments, time and refunds</h2>
        <ul>
          <li>Speakers pay for time, either as a monthly plan or as a number of hours. Listening in text, and with your own device's voice, is free.</li>
          <li>Time you buy is valid for 30 days from the day you pay. Time not used by then expires, and the money for it is not refundable. Please buy only what you expect to use.</li>
          <li>Only time a session is live and in use is counted. If the local voice is unavailable and the standard voice takes over, that period is not counted against your time.</li>
          <li>A listener pass lasts 30 days from payment and is not refundable. The local voice needs both a listener pass and a speaker who has turned the local voice on.</li>
          <li>When your time runs out, a session continues for a short grace period, then paid features stop until you add time.</li>
          <li>Payments are processed by Paystack. If a payment is taken twice by mistake, or we fail to give you the time you paid for, contact us and we will put it right.</li>
        </ul>
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
