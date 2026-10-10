import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/vv/primitives";
import { JoinForm } from "@/components/vv/JoinForm";

export const Route = createFileRoute("/app/join")({
  head: () => ({ meta: [{ title: "Join a session — Voice Verse" }] }),
  component: Join,
});

function Join() {
  return (
    <>
      <PageHeader title="Join a session" description="Enter the code the speaker is showing. You don't need to speak or share anything." />
      <div className="max-w-md"><JoinForm /></div>
    </>
  );
}
