import { createFileRoute } from "@tanstack/react-router";
import { JoinForm } from "@/components/vv/JoinForm";
import { Logo } from "@/components/vv/primitives";

export const Route = createFileRoute("/join")({
  head: () => ({ meta: [{ title: "Join a session — Voice Verse" }, { name: "description", content: "Enter a session code to follow a live speaker with subtitles and translation. No account needed." }] }),
  component: () => (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <h1 className="rise text-2xl font-semibold">Join a live session</h1>
        <p className="rise d-1 mb-6 mt-2 text-muted-foreground">No account needed. Enter the code the speaker is showing.</p>
        <JoinForm />
      </div>
    </div>
  ),
});
