import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, FieldError } from "@/components/vv/AuthShell";
import { SubmitButton, isEmail } from "@/components/vv/SubmitButton";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Voice Verse" }] }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setError("Enter the email address you signed up with.");
    setError(undefined);
    setState("loading");
    try {
      await api.auth.requestPasswordReset(email, `${window.location.origin}/reset-password`);
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError && err.status === 0 ? "You appear to be offline." : "We couldn't send the email. Please try again.");
    }
  }

  if (state === "sent") {
    return (
      <AuthShell title="Check your email" subtitle="If that address has a Voice Verse account, we just sent a link to choose a new password.">
        <div className="rounded-xl border bg-card p-5">
          <MailCheck className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The link works once and lasts an hour. It can take a minute to arrive, and it may land in your spam folder.
          </p>
        </div>
        <div className="mt-6">
          <Button asChild className="w-full"><Link to="/login">Back to sign in</Link></Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we will send you a link."
      footer={<>Remembered it? <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} className="mt-2 h-11" />
          <FieldError msg={error} />
        </div>
        <SubmitButton state={state === "loading" ? "loading" : "idle"} loadingText="Sending…">Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}
