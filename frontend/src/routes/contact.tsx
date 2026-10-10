import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/vv/AuthShell";
import { PublicPage } from "@/components/vv/PublicPage";
import { SubmitButton, isEmail } from "@/components/vv/SubmitButton";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact — Voice Verse" }, { name: "description", content: "Ask a question, offer feedback or ask about a pilot at your school, church or organisation." }] }),
  component: Contact,
});

const TOPICS = [
  ["question", "A question"],
  ["pilot", "Pilot at my school, church or organisation"],
  ["feedback", "Feedback"],
  ["accessibility", "An accessibility problem"],
  ["other", "Something else"],
] as const;

function Contact() {
  const [f, setF] = useState({ name: "", email: "", message: "", website: "" });
  const [topic, setTopic] = useState<(typeof TOPICS)[number][0]>("question");
  const [errors, setErrors] = useState<{ name?: string | undefined; email?: string | undefined; message?: string | undefined; form?: string | undefined }>({});
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!f.name.trim()) next.name = "Please tell us your name.";
    if (!isEmail(f.email)) next.email = "Enter a valid email address so we can reply.";
    if (f.message.trim().length < 5) next.message = "Write a few words so we know how to help.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setState("loading");
    try {
      await api.contact({ name: f.name.trim(), email: f.email.trim(), topic, message: f.message.trim(), website: f.website });
      setState("done");
    } catch (err) {
      setState("idle");
      setErrors({ form: err instanceof ApiError && err.status === 429 ? "You've sent a few messages already. Please try again later." : err instanceof ApiError && err.status === 0 ? "You appear to be offline." : "We couldn't send your message. Please try again." });
    }
  }

  return (
    <PublicPage eyebrow="Contact" title="Tell us what you need." lead="Questions, feedback, or a gathering you would like to try Voice Verse at. A real person reads every message.">
      {state === "done" ? (
        <div className="rise max-w-md rounded-2xl border bg-card p-8 text-center">
          <svg viewBox="0 0 52 52" className="mx-auto h-16 w-16 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle className="draw go" pathLength={1} cx="26" cy="26" r="23" />
            <path className="draw go" pathLength={1} style={{ ["--d" as string]: "600ms" }} d="M15 27l8 8 14-16" />
          </svg>
          <h2 className="mt-5 font-display text-2xl">Message received</h2>
          <p className="mt-2 text-sm text-muted-foreground">Thank you. We'll reply to {f.email}.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="rise max-w-xl space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" autoComplete="name" value={f.name} onChange={set("name")} aria-invalid={!!errors.name} className="mt-2 h-11" />
              <FieldError msg={errors.name} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email} className="mt-2 h-11" />
              <FieldError msg={errors.email} />
            </div>
          </div>
          <div>
            <Label>What is it about?</Label>
            <Select value={topic} onValueChange={(v) => setTopic(v as typeof topic)}>
              <SelectTrigger className="mt-2 h-11" aria-label="Topic"><SelectValue /></SelectTrigger>
              <SelectContent>{TOPICS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" rows={6} maxLength={4000} value={f.message} onChange={set("message")} aria-invalid={!!errors.message} className="mt-2" />
            <FieldError msg={errors.message} />
          </div>
          {/* Honeypot: hidden from people, tempting to bots */}
          <input tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={set("website")} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
          <FieldError msg={errors.form} />
          <SubmitButton state={state} loadingText="Sending…">Send message</SubmitButton>
        </form>
      )}
    </PublicPage>
  );
}
