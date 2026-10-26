import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Headphones, Mic2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/vv/primitives";
import { api, ApiError, type Balance, type PlanInfo, type Pricing, type Tier } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/billing")({
  head: () => ({ meta: [{ title: "Time and plans — Voice Verse" }] }),
  component: Billing,
});

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const hoursLabel = (s: number) => {
  const h = s / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${Math.round(h * 10) / 10} h`;
};
const EVENTS: { id: PlanInfo["event"]; label: string; blurb: string }[] = [
  { id: "sermon", label: "Sermon", blurb: "For a weekly sermon of up to 2 hours." },
  { id: "service", label: "Church service", blurb: "For full services of 4 to 5 hours." },
  { id: "conference", label: "Conference", blurb: "For events of 8 to 10 hours." },
  { id: "classroom", label: "Classroom", blurb: "For lessons through the month." },
];
const LEVEL_NAME: Record<Tier, string> = { captions: "Captions", standard: "Standard voice", local: "Local voice" };

function Billing() {
  const { user } = useAuth();
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: api.billing.pricing, staleTime: 5 * 60_000 });
  const me = useQuery({ queryKey: ["billing-me"], queryFn: api.billing.me, enabled: !!user });
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function pay(plan: string) {
    setError(undefined);
    setPaying(plan);
    try {
      const r = await api.billing.checkout(plan);
      window.location.href = r.authorizationUrl; // Paystack's secure page
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't start the payment. Please try again.");
      setPaying(null);
    }
  }

  if (!pricing.data) return <div className="shimmer h-64 rounded-2xl" aria-label="Loading prices" />;
  const p = pricing.data;
  const isHost = user?.role === "educator";

  return (
    <>
      <PageHeader title="Time and plans" description="Listening is free. Speakers pay for the time their session runs, in the way that suits them: a plan for the month, or just the hours they need." />
      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

      {isHost && me.data && <Remaining balance={me.data.balance} />}

      {isHost && <BuyHours p={p} paying={paying} onPay={pay} />}
      {isHost && <Plans p={p} paying={paying} onPay={pay} />}
      <ListenerPass p={p} me={me.data?.listener} paying={paying} onPay={pay} />
      <Rules p={p} />
    </>
  );
}

function Remaining({ balance }: { balance: Balance }) {
  const rows = (["captions", "standard", "local"] as Tier[]).filter((t) => balance[t].seconds > 0 || t === "captions");
  return (
    <section className="rise mb-8 rounded-2xl border bg-card p-6" aria-labelledby="left-title">
      <h2 id="left-title" className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-primary" /> Your time</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((t) => (
          <div key={t} className="rounded-xl bg-secondary px-4 py-3">
            <p className="text-xs text-muted-foreground">{LEVEL_NAME[t]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{hoursLabel(balance[t].seconds)}</p>
            {balance[t].nextExpiry && balance[t].seconds > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Use by {new Date(balance[t].nextExpiry!).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{balance.nothingBoughtYet ? "You have a little free captions time each month. Buy time below for voice and longer sessions." : "Higher levels also cover the lower ones. Time that is not used by its date expires."}</p>
    </section>
  );
}

function LevelPicker({ p, value, onChange }: { p: Pricing; value: Tier; onChange: (t: Tier) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="What to include">
      {p.levels.map((l) => (
        <button key={l.tier} type="button" role="radio" aria-checked={value === l.tier} onClick={() => onChange(l.tier)}
          className={cn("rounded-xl border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-ring", value === l.tier ? "border-primary bg-primary/5" : "hover:bg-secondary")}>
          <span className="flex items-center gap-2 font-medium">
            {l.tier === "local" ? <Sparkles className="h-4 w-4 text-primary" /> : l.tier === "standard" ? <Mic2 className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
            {l.name}
            {l.tier === "local" && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Best</span>}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{l.about}</span>
        </button>
      ))}
    </div>
  );
}

function BuyHours({ p, paying, onPay }: { p: Pricing; paying: string | null; onPay: (plan: string) => void }) {
  const [tier, setTier] = useState<Tier>("local");
  const [hours, setHours] = useState(5);
  const price = p.hours.prices[tier][String(hours)] ?? 0;
  const days = p.hours.dayHours;
  const plan = `hours-${tier}-${hours}`;
  return (
    <section className="rise mb-8 rounded-2xl border bg-card p-6" aria-labelledby="hours-title">
      <h2 id="hours-title" className="text-lg font-semibold">Pay only for the hours you need</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose what you want, then how many hours. A day of speaking is about {days} hours.</p>
      <div className="mt-5"><LevelPicker p={p} value={tier} onChange={setTier} /></div>
      <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Hours">
        {p.hours.choices.map((h) => (
          <button key={h} type="button" role="radio" aria-checked={hours === h} onClick={() => setHours(h)}
            className={cn("rounded-full border px-4 py-2 text-sm transition focus-visible:ring-2 focus-visible:ring-ring", hours === h ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")}>
            {h % days === 0 && h >= days ? `${h / days} ${h / days === 1 ? "day" : "days"} · ${h} h` : `${h} ${h === 1 ? "hour" : "hours"}`}
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-secondary px-5 py-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{naira(price)}</p>
          <p className="text-xs text-muted-foreground">{hours} {hours === 1 ? "hour" : "hours"} of {LEVEL_NAME[tier].toLowerCase()}, valid for {p.rules.validDays} days{hours >= p.hours.bulk.fromHours ? ` · ${p.hours.bulk.discountPercent}% off for ${p.hours.bulk.fromHours}+ hours` : ""}</p>
        </div>
        <Button size="lg" disabled={!!paying} onClick={() => onPay(plan)}>{paying === plan ? "Opening payment…" : "Pay with Paystack"}</Button>
      </div>
    </section>
  );
}

function Plans({ p, paying, onPay }: { p: Pricing; paying: string | null; onPay: (plan: string) => void }) {
  const [event, setEvent] = useState<PlanInfo["event"]>("service");
  const shown = p.plans.filter((x) => x.event === event);
  const e = EVENTS.find((x) => x.id === event)!;
  return (
    <section className="rise mb-8 rounded-2xl border bg-card p-6" aria-labelledby="plans-title">
      <h2 id="plans-title" className="text-lg font-semibold">Monthly plans</h2>
      <p className="mt-1 text-sm text-muted-foreground">A better price for regular speakers. Pick the kind of event you run.</p>
      <Tabs value={event} onValueChange={(v) => setEvent(v as PlanInfo["event"])} className="mt-4">
        <TabsList className="flex h-auto flex-wrap">{EVENTS.map((x) => <TabsTrigger key={x.id} value={x.id}>{x.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <p className="mt-3 text-sm text-muted-foreground">{e.blurb}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {shown.map((x) => (
          <div key={x.id} className={cn("flex flex-col rounded-xl border p-5", x.tier === "local" && "border-primary bg-primary/5")}>
            <p className="font-medium">{LEVEL_NAME[x.tier]}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{naira(x.amount)}<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {x.includes.map((i) => <li key={i.tier} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{i.hours} hours of {LEVEL_NAME[i.tier].toLowerCase()}</li>)}
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{x.about.replace(/^\d+ hours for 30 days\.\s*/, "")}</li>
            </ul>
            <Button className="mt-5" variant={x.tier === "local" ? "default" : "outline"} disabled={!!paying} onClick={() => onPay(x.id)}>{paying === x.id ? "Opening payment…" : "Choose"}</Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ListenerPass({ p, me, paying, onPay }: { p: Pricing; me: { pass: boolean; passUntil: string | null; trialSecondsLeft: number } | undefined; paying: string | null; onPay: (plan: string) => void }) {
  return (
    <section id="listener" className="rise mb-8 rounded-2xl border bg-card p-6" aria-labelledby="pass-title">
      <h2 id="pass-title" className="text-lg font-semibold">For listeners: the local voice</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.listener.about}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-secondary px-5 py-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{naira(p.listener.amount)}<span className="text-sm font-normal text-muted-foreground"> / {p.listener.days} days</span></p>
          <p className="text-xs text-muted-foreground">
            {me?.pass ? `Active until ${new Date(me.passUntil!).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}.` : `Try it free first: about ${p.listener.trialMinutes} minutes of local voice, once.`}
          </p>
        </div>
        <Button size="lg" variant={me?.pass ? "outline" : "default"} disabled={!!paying} onClick={() => onPay(p.listener.id)}>
          {paying === p.listener.id ? "Opening payment…" : me?.pass ? "Add 30 more days" : "Get the listener pass"}
        </Button>
      </div>
    </section>
  );
}

function Rules({ p }: { p: Pricing }) {
  return (
    <section className="rise rounded-2xl border bg-card p-6 text-sm" aria-labelledby="rules-title">
      <h2 id="rules-title" className="text-base font-semibold">How it works</h2>
      <ul className="mt-3 space-y-2 text-muted-foreground">
        <li>Time you buy is valid for {p.rules.validDays} days. Time you have not used by then expires and cannot be refunded, so buy what you will use.</li>
        <li>Only time your session is live and in use is counted. Quiet gaps are not charged.</li>
        <li>If the local voice is unavailable and we switch to the standard voice, your time is not used while that lasts.</li>
        <li>You choose how long a session may run. If your time ends, the session carries on for {p.rules.graceMinutes} minutes so a talk is never cut off mid-sentence, then paid features stop until you add time.</li>
        <li>{p.rules.extraVoiceLanguages}</li>
        <li>Payments are handled by Paystack. We never see your card details. <a href="/terms" className="text-primary underline underline-offset-4">Read the terms</a>.</li>
      </ul>
    </section>
  );
}
