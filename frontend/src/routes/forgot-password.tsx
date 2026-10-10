import { createFileRoute, Link } from "@tanstack/react-router";
import { MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/vv/AuthShell";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Voice Verse" }] }),
  component: Forgot,
});

// Email delivery isn't configured on the server yet, so we say so plainly rather than pretend to send a link.
function Forgot() {
  return (
    <AuthShell title="Reset your password" subtitle="Self-service reset by email isn't available yet.">
      <div className="rounded-xl border bg-card p-5">
        <MailX className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Voice Verse can't send email just now. Please contact the administrator of your organisation to have your password reset,
          or create a new account with a different email address.
        </p>
      </div>
      <div className="mt-6 flex gap-3">
        <Button asChild className="flex-1"><Link to="/login">Back to sign in</Link></Button>
        <Button variant="outline" asChild className="flex-1"><Link to="/signup">Create account</Link></Button>
      </div>
    </AuthShell>
  );
}
