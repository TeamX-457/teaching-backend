import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, FieldError } from "@/components/vv/AuthShell";
import { SubmitButton, wait } from "@/components/vv/SubmitButton";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Choose a new password — Voice Verse" }] }),
  // The emailed link lands here as /reset-password?token=...  (or ?error=INVALID_TOKEN when it is wrong or used up).
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  if (!token || linkError) {
    return (
      <AuthShell title="This link has expired" subtitle="The reset link is wrong, already used, or too old.">
        <Button asChild className="w-full"><Link to="/forgot-password">Send me a new link</Link></Button>
      </AuthShell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "The two passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setState("loading");
    try {
      await api.auth.resetPassword(token!, password);
      setState("done");
      await wait(600);
      navigate({ to: "/login" });
    } catch (err) {
      setState("idle");
      setErrors({ form: err instanceof ApiError && err.status === 0 ? "You appear to be offline." : "That link is no longer valid, or the password was not accepted. Ask for a new link and try again." });
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you have not used elsewhere.">
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} className="mt-2 h-11" />
          <FieldError msg={errors.password} />
        </div>
        <div>
          <Label htmlFor="confirm">Repeat the new password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} className="mt-2 h-11" />
          <FieldError msg={errors.confirm} />
        </div>
        <FieldError msg={errors.form} />
        <SubmitButton state={state} loadingText="Saving…">Save new password</SubmitButton>
      </form>
    </AuthShell>
  );
}
