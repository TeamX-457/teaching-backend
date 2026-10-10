import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, FieldError } from "@/components/vv/AuthShell";
import { SubmitButton, isEmail, wait } from "@/components/vv/SubmitButton";
import { api, ApiError } from "@/lib/api";
import { actions } from "@/lib/store";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Voice Verse" }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setState("loading");
    try {
      const r = await api.auth.signIn({ email, password });
      actions.signIn({ name: r.user.name, email: r.user.email, role: r.user.role });
      qc.invalidateQueries({ queryKey: ["session"] });
      setState("done");
      await wait(350);
      navigate({ to: "/app" });
    } catch (err) {
      setState("idle");
      setErrors({ form: err instanceof ApiError && err.status === 401 ? "That email and password don't match an account." : err instanceof ApiError && err.status === 0 ? "You appear to be offline." : "We couldn't sign you in. Please try again." });
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to start listening or host a session."
      footer={<>New to Voice Verse? <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} className="mt-2 h-11" />
          <FieldError msg={errors.email} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} className="mt-2 h-11" />
          <FieldError msg={errors.password} />
        </div>
        <FieldError msg={errors.form} />
        <SubmitButton state={state} loadingText="Signing in…">Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
