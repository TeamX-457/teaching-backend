import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Headphones, Mic2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PublicPage } from "@/components/vv/PublicPage";
import { api, type PlanInfo, type Pricing, type Tier } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Voice Verse" },
      { name: "description", content: "Listening is free. Speakers pay only for the time their session runs: by the hour, or a plan for the month. Hear real Hausa, Yoruba and Igbo voices." },
    ],
  }),
  component: PricingPage,
});

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const LEVEL: Record<Tier, string> = { captions: "Captions", standard: "Standard voice", local: "Local voice" };
const EVENTS: { id: PlanInfo["event"]; label: string; blurb: string }[] = [
  { id: "sermon", label: "Sermon", blurb: "A weekly sermon of up to 2 hours." },
  { id: "service", label: "Church service", blurb: "Full services of 4 to 5 hours." },
  { id: "conference", label: "Conference", blurb: "Events of 8 to 10 hours." },
  { id: "classroom", label: "Classroom", blurb: "Lessons through the month." },
];

function PricingPage() {
  const user = useStore((s) => s.user);
  const q = useQuery({ queryKey: ["pricing"], queryFn: api.billing.pricing, staleTime: 5 * 60_000 });
  const buy = user ? "/app/billing" : "/signup";
  const buyLabel = user ? "Buy time" : "Create a free account";

  return (
    <PublicPage
      wide
      eyebrow="Pricing"
      title="Listening is free. Speakers pay for time."
      lead="No contract and nothing hidden. Listen for free, host a short session free every month, then pay only for the hours you need or a plan for the month."
    >
      {!q.data ? (
        <div className="shimmer h-72 rounded-2xl" aria-label="Loading prices" />
      ) : (
        <div className="space-y-14">
          <Levels p={q.data} />
          <Listeners p={q.data} buy={buy} />
          <Hours p={q.data} buy={buy} label={buyLabel} />
          <Plans p={q.data} buy={buy} label={buyLabel} />
          <Developers />
          <Fine p={q.data} />
        </div>
      )}
    </PublicPage>
  );
}

function Levels({ p }: { p: Pricing }) {
  const icon = { captions: Headphones, standard: Mic2, local: Sparkles } as const;
  return (
    <section aria-labelledby="levels">
      <h2 id="levels" className="font-display text-2xl">What you can choose</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {p.levels.map((l) => {
          const Icon = icon[l.tier];
          return (
            <div key={l.tier} className={cn("rounded-2xl border bg-card p-6", l.tier === "local" && "border-primary")}>
              <Icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">{l.name}{l.tier === "local" && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Most natural</span>}</p>
              <p className="mt-1 text-sm text-muted-foreground">{l.about}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Listeners({ p, buy }: { p: Pricing; buy: string }) {
  return (
    <section aria-labelledby="listeners" className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 id="listeners" className="font-display text-2xl">For listeners</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-3xl font-semibold">Free</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Live subtitles in your language</li>
            <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Your phone reads the translation aloud</li>
            <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Join any session with a code, no account needed</li>
          </ul>
        </div>
        <div>
          <p className="text-3xl font-semibold">{naira(p.listener.amount)}<span className="text-base font-normal text-muted-foreground"> / {p.listener.days} days</span></p>
          <p className="mt-1 text-sm font-medium">Local voice pass</p>
          <p className="mt-2 text-sm text-muted-foreground">{p.listener.about} Try about {p.listener.trialMinutes} minutes free first.</p>
          <Button asChild className="mt-4" variant="outline"><a href={buy}>Get started <ArrowRight /></a></Button>
        </div>
      </div>
    </section>
  );
}

function Hours({ p, buy, label }: { p: Pricing; buy: string; label: string }) {
  const [tier, setTier] = useState<Tier>("local");
  const days = p.hours.dayHours;
  return (
    <section aria-labelledby="hours">
      <h2 id="hours" className="font-display text-2xl">For speakers: pay for the hours you need</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every speaker gets 30 free minutes of captions each month. After that, buy hours: a day of speaking is about {days} hours. Hours last {p.rules.validDays} days.</p>
      <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Level">
        {p.levels.map((l) => (
          <button key={l.tier} role="radio" aria-checked={tier === l.tier} onClick={() => setTier(l.tier)}
            className={cn("rounded-full border px-4 py-2 text-sm transition focus-visible:ring-2 focus-visible:ring-ring", tier === l.tier ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")}>{l.name}</button>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {p.hours.choices.map((h) => (
          <div key={h} className="rounded-xl border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">{h % days === 0 ? `${h / days} ${h / days === 1 ? "day" : "days"} · ${h} h` : `${h} ${h === 1 ? "hour" : "hours"}`}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{naira(p.hours.prices[tier][String(h)] ?? 0)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{p.hours.bulk.discountPercent}% off when you buy {p.hours.bulk.fromHours} hours or more at once.</p>
      <Button asChild className="mt-5"><a href={buy}>{label} <ArrowRight /></a></Button>
    </section>
  );
}

function Plans({ p, buy, label }: { p: Pricing; buy: string; label: string }) {
  const [event, setEvent] = useState<PlanInfo["event"]>("service");
  const shown = p.plans.filter((x) => x.event === event);
  const e = EVENTS.find((x) => x.id === event)!;
  return (
    <section aria-labelledby="plans">
      <h2 id="plans" className="font-display text-2xl">Monthly plans for regular speakers</h2>
      <p className="mt-2 text-sm text-muted-foreground">A better price than buying hours one by one. Pick the kind of event you run.</p>
      <Tabs value={event} onValueChange={(v) => setEvent(v as PlanInfo["event"])} className="mt-5">
        <TabsList className="flex h-auto flex-wrap">{EVENTS.map((x) => <TabsTrigger key={x.id} value={x.id}>{x.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <p className="mt-3 text-sm text-muted-foreground">{e.blurb}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {shown.map((x) => (
          <div key={x.id} className={cn("flex flex-col rounded-2xl border bg-card p-6", x.tier === "local" && "border-primary")}>
            <p className="font-medium">{LEVEL[x.tier]}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{naira(x.amount)}<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted-foreground">
              {x.includes.map((i) => <li key={i.tier} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{i.hours} hours of {LEVEL[i.tier].toLowerCase()}</li>)}
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{x.about.replace(/^\d+ hours for 30 days\.\s*/, "")}</li>
            </ul>
            <Button asChild className="mt-5" variant={x.tier === "local" ? "default" : "outline"}><a href={buy}>{label}</a></Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Developers() {
  return (
    <section aria-labelledby="devs" className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 id="devs" className="font-display text-2xl">For developers</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Translate and speak from your own code with the same engine as the app. Pay as you go with prepaid credit, see exactly what each call cost, and set a monthly limit on every key. Prices are shown in your dashboard once you sign in.</p>
      <Button asChild className="mt-4" variant="outline"><a href="/app/developers">Open the developer dashboard <ArrowRight /></a></Button>
    </section>
  );
}

function Fine({ p }: { p: Pricing }) {
  return (
    <section aria-labelledby="fine" className="text-sm text-muted-foreground">
      <h2 id="fine" className="font-display text-xl text-foreground">The small print, in plain words</h2>
      <ul className="mt-3 space-y-2">
        <li>Time you buy is valid for {p.rules.validDays} days. Time not used by then expires, and it cannot be refunded, so buy what you will use.</li>
        <li>Only time your session is live and in use counts. If the local voice is briefly unavailable and the standard voice takes over, your time is not used while that lasts.</li>
        <li>If your time ends mid-talk, the session carries on for {p.rules.graceMinutes} minutes so nobody is cut off mid-sentence.</li>
        <li>Payments are made on Paystack. We never see your card details. <a href="/terms" className="text-primary underline underline-offset-4">Read the terms</a>.</li>
      </ul>
    </section>
  );
}
