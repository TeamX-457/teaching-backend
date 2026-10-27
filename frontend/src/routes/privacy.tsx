import { createFileRoute } from "@tanstack/react-router";
import { PublicPage, Prose } from "@/components/vv/PublicPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — Voice Verse" }] }),
  component: () => (
    <PublicPage eyebrow="Privacy" title="What we keep, and what we don't." lead="Spoken conversations can be sensitive. This is how Voice Verse handles them.">
      <Prose>
        <h2>Payments</h2>
        <p>Payments are made on Paystack's own page. We receive your name, email, the amount and whether it succeeded, and keep that record to give you your time and for our accounts. We never see or store your card details.</p>
        <h2>Audio</h2>
        <p>Voice Verse does not record or store audio. Your browser turns speech into text while you listen. Depending on your browser, that step may be performed by your browser vendor's speech service, which has its own privacy policy.</p>
        <h2>Text from your own listening sessions</h2>
        <p>Transcripts and translations of sessions you listen to are kept <strong>on your device only</strong>, if you leave "Save session history" on. You choose how long they are kept, and you can delete them at any time in History or Settings.</p>
        <h2>Translation</h2>
        <p>To translate a sentence, its text is sent to our server and, when one is connected, to a translation service. We do not attach your name or email to it.</p>
        <h2>Hosted sessions</h2>
        <p>When a speaker hosts a session, the captions of that session are stored on our server so listeners can follow along. Listeners who join with a code need no account.</p>
        <h2>Your account</h2>
        <p>If you create an account we store your name, email address and role, and a hashed password. We use them only to sign you in.</p>
        <h2>Messages you send us</h2>
        <p>Messages sent through the contact form are stored so we can reply.</p>
        <h2>Questions</h2>
        <p>Use the <a href="/contact" className="text-primary underline underline-offset-4">contact page</a> to ask us to delete your account or messages.</p>
      </Prose>
    </PublicPage>
  ),
});
