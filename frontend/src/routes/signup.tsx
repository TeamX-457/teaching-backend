import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Headphones, Mic } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, FieldError } from "@/components/vv/AuthShell";
import { SubmitButton, isEmail, wait } from "@/components/vv/SubmitButton";
import { api, ApiError } from "@/lib/api";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create your account — Voice Verse" }] }),
  component: Signup,
});

type Role = "student" | "educator";
const ROLES: { value: Role; title: string; body: string; icon: typeof Mic }[] = [
  { value: "student", title: "I'm here to listen", body: "Follow talks with subtitles, translation and audio.", icon: Headphones },
  { value: "educator", title: "I speak at events", body: "Host sessions and share a code with your audience.", icon: Mic },
];

function Signup() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [role, setRole] = useState<Role>("student");
  const [errors, setErrors] = useState<{ name?: string | undefined; email?: string | undefined; password?: string | undefined; form?: string | undefined }>({});
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (f.name.trim().length < 2) next.name = "Enter your name.";
    if (!isEmail(f.email)) next.email = "Enter a valid email address.";
    if (f.password.length < 8) next.password = "Use at least 8 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setState("loading");
    try {
      const r = await api.auth.signUp({ name: f.name.trim(), email: f.email, password: f.password, role });
      actions.signIn({ name: r.user.name, email: r.user.email, role: r.user.role });
      qc.invalidateQueries({ queryKey: ["session"] });
      setState("done");
      await wait(350);
      navigate({ to: "/app" });
    } catch (err) {
      setState("idle");
      const msg = err instanceof ApiError
        ? err.status === 0 ? "You appear to be offline." : /exist|already/i.test(err.message) ? "An account with this email already exists." : err.message
        : "We couldn't create your account. Please try again.";
      setErrors({ form: msg });
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. No audio is ever stored."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <fieldset>
          <legend className="sr-only">How will you use Voice Verse?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label key={r.value} className={cn("card-hover cursor-pointer rounded-xl border bg-card p-4 transition-colors", role === r.value && "border-primary bg-accent/60")}>
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="sr-only" />
                <r.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                <span className="mt-3 block text-sm font-medium">{r.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{r.body}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" value={f.name} onChange={set("name")} aria-invalid={!!errors.name} className="mt-2 h-11" />
          <FieldError msg={errors.name} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email} className="mt-2 h-11" />
          <FieldError msg={errors.email} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} aria-invalid={!!errors.password} className="mt-2 h-11" />
          <FieldError msg={errors.password} />
        </div>
        <FieldError msg={errors.form} />
        <SubmitButton state={state} loadingText="Creating account…">Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
