/**
 * What Voice Verse sells, and the rules for using it. Prices are checked on the server: an app can never choose
 * its own amount.
 *
 * Hosts buy TIME, in hours, at one of three levels:
 *   captions  translated captions, read on the listener's own device (their phone's voice)
 *   standard  + a Nigerian-English voice reading the translation aloud
 *   local     + a real Hausa, Yoruba or Igbo voice
 * A higher level also covers the lower ones. Time is bought as a monthly plan (a bundle) or as plain hours; both
 * become the same thing in the ledger: seconds that expire BUNDLE_DAYS after payment and are not refundable.
 *
 * Listeners hear the translation for free. The real local voice needs a listener pass (and a host who paid for
 * the local level), after a short free trial.
 *
 * NOTHING in this file is shown to customers as a per-minute or per-word rate.
 */
export type Tier = "captions" | "standard" | "local";
export const TIERS: Tier[] = ["captions", "standard", "local"];
export const tierRank = (t: Tier) => TIERS.indexOf(t);

/** How long bought time lasts. After this the unused time is gone and nothing is refunded. */
export const BUNDLE_DAYS = 30;

/** Naira per hour when buying hours directly. Standard is about 65% of local, so local is the easy choice. */
export const HOURLY_NAIRA: Record<Tier, number> = { captions: 4_000, standard: 10_000, local: 15_000 };
export const MIN_HOURS = 1;
export const MAX_HOURS = 40;
/** Ten hours or more at once is 10% off. */
export const BULK_HOURS = 10;
export const BULK_DISCOUNT = 0.1;

/** Quick choices in the app. A "day" is five hours. */
export const DAY_HOURS = 5;
export const HOUR_CHOICES = [1, 2, 3, 5, 10, 15];

/** Every language beyond the first that speaks aloud uses the host's time at the same rate. */
export const MAX_VOICE_LANGUAGES = 3;

/** After the host's time runs out the session carries on for this long, then paid features stop. */
export const GRACE_SECONDS = 15 * 60;
/** A session is counted as idle when nothing has happened for this long; idle time is not charged. */
export const IDLE_SECONDS = 60;
/** Free time every speaker gets each calendar month, captions level. */
export const FREE_MONTHLY_SECONDS = 30 * 60;

/** Listener pass: unlimited local voice in sessions whose host paid for it. */
export const LISTENER_PASS_NAIRA = 2_000;
export const LISTENER_PASS_DAYS = 30;
/** Local voice a listener can try before paying, once per account. */
export const LISTENER_TRIAL_SECONDS = 5 * 60;

export type EventKind = "sermon" | "service" | "conference" | "classroom";

export type Bundle = {
  id: string;
  event: EventKind;
  tier: Tier;
  name: string;
  hours: number;
  amountNaira: number;
  description: string;
};

const bundle = (event: EventKind, tier: Tier, name: string, hours: number, amountNaira: number, about: string): Bundle => ({
  id: `${event}-${tier}`,
  event,
  tier,
  name: `${name} (${tier === "captions" ? "captions" : tier === "standard" ? "standard voice" : "local voice"})`,
  hours,
  amountNaira,
  description: `${hours} hours for 30 days. ${about}`,
});

/** Monthly plans. The "classroom" voice plans include fewer hours of voice than of captions: see `voiceHours`. */
export const BUNDLES: Bundle[] = [
  bundle("sermon", "captions", "Sermon", 8, 25_000, "Up to 2 hours per sermon."),
  bundle("sermon", "standard", "Sermon", 8, 65_000, "Up to 2 hours per sermon."),
  bundle("sermon", "local", "Sermon", 8, 100_000, "Up to 2 hours per sermon."),
  bundle("service", "captions", "Church service", 20, 60_000, "Up to 5 hours per service."),
  bundle("service", "standard", "Church service", 20, 156_000, "Up to 5 hours per service."),
  bundle("service", "local", "Church service", 20, 240_000, "Up to 5 hours per service."),
  bundle("conference", "captions", "Conference", 10, 35_000, "Up to 10 hours per event."),
  bundle("conference", "standard", "Conference", 10, 98_000, "Up to 10 hours per event."),
  bundle("conference", "local", "Conference", 10, 150_000, "Up to 10 hours per event."),
  bundle("classroom", "captions", "Classroom", 8, 15_000, "For lessons of any length."),
  bundle("classroom", "standard", "Classroom", 8, 40_000, "8 hours: 4 with voice, the rest captions only."),
  bundle("classroom", "local", "Classroom", 8, 60_000, "8 hours: 4 with local voice, the rest captions only."),
];

/** What a bundle puts in the ledger: [tier, hours]. Classroom voice plans split the hours between two levels. */
export function bundleGrants(b: Bundle): { tier: Tier; hours: number }[] {
  if (b.event === "classroom" && b.tier !== "captions") {
    return [
      { tier: b.tier, hours: 4 },
      { tier: "captions", hours: b.hours - 4 },
    ];
  }
  return [{ tier: b.tier, hours: b.hours }];
}

export const bundleById = (id: string) => BUNDLES.find((b) => b.id === id);

/** The price of buying `hours` hours at `tier`, in naira. Whole naira, rounded to the nearest 100. */
export function hoursPrice(tier: Tier, hours: number): number {
  const base = HOURLY_NAIRA[tier] * hours;
  const price = hours >= BULK_HOURS ? base * (1 - BULK_DISCOUNT) : base;
  return Math.round(price / 100) * 100;
}

export const validHours = (h: unknown): h is number =>
  typeof h === "number" && Number.isInteger(h) && h >= MIN_HOURS && h <= MAX_HOURS;

// ---- what the payment ledger sells ----------------------------------------------------------------------

/**
 * A thing for sale in the payments ledger. `kind` decides what a payment grants (see billing.service.ts):
 * hours or a bundle become time, a listener pass becomes a pass.
 */
export type Plan = {
  id: string;
  name: string;
  purpose: string;
  description: string;
  amountNaira: number | null;
  enabled: boolean;
};

export const hoursPlanId = (tier: Tier, hours: number) => `hours-${tier}-${hours}`;
export const PARSE_HOURS = /^hours-(captions|standard|local)-(\d{1,2})$/;

/** Resolves a plan id to something to charge, or undefined if there is no such thing for sale. */
export function resolvePlan(id: string): Plan | undefined {
  const h = PARSE_HOURS.exec(id);
  if (h) {
    const tier = h[1] as Tier;
    const hours = Number(h[2]);
    if (!validHours(hours)) return undefined;
    return {
      id,
      name: `${hours} ${hours === 1 ? "hour" : "hours"} (${tier})`,
      purpose: "HOURS",
      description: `Voice Verse ${hours} ${hours === 1 ? "hour" : "hours"}, ${tier}`,
      amountNaira: hoursPrice(tier, hours),
      enabled: true,
    };
  }
  const b = bundleById(id);
  if (b) return { id, name: b.name, purpose: "PLAN", description: `Voice Verse ${b.name}`, amountNaira: b.amountNaira, enabled: true };
  if (id === "listener-pass") {
    return {
      id,
      name: "Listener pass",
      purpose: "LISTENER",
      description: "Voice Verse listener pass, 30 days",
      amountNaira: LISTENER_PASS_NAIRA,
      enabled: true,
    };
  }
  const credit = API_CREDIT_PARSE.exec(id);
  if (credit) {
    const naira = Number(credit[1]);
    if (!API_CREDIT_PACKS.includes(naira)) return undefined;
    return { id, name: `API credit ₦${naira.toLocaleString("en-NG")}`, purpose: "APICREDIT", description: `Voice Verse API credit ${naira}`, amountNaira: naira, enabled: true };
  }
  return PLANS.find((p) => p.id === id);
}

// ---- developer API --------------------------------------------------------------------------------------
/**
 * What developers are billed, in naira. These are the prices they see on their usage page; our own costs and
 * margins are never shown. Used only when API_BILLING_ENFORCED=1 deducts from credit; before that the usage page
 * shows what use would cost.
 */
export const API_RATES = {
  /** per 100 words translated */
  translatePer100Words: 35,
  /** per minute of generated speech */
  speechStandardPerMinute: 45,
  speechLocalPerMinute: 250,
  /** per minute of audio transcribed */
  transcribePerMinute: 80,
};
export type ApiKind = "translation" | "speech" | "transcription";
export type ApiVoiceClass = "text" | "standard" | "local";

/** The billed price, in kobo, of `units` (words for translation, seconds of audio otherwise). Always rounds up. */
export function apiPriceKobo(kind: ApiKind, cls: ApiVoiceClass, units: number): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  const n = Math.ceil(units);
  if (kind === "translation") return Math.ceil((n * API_RATES.translatePer100Words * 100) / 100);
  const perMinute = kind === "transcription" ? API_RATES.transcribePerMinute : cls === "local" ? API_RATES.speechLocalPerMinute : API_RATES.speechStandardPerMinute;
  return Math.ceil((n * perMinute * 100) / 60);
}

/** Prepaid credit packs for developers. The id carries the amount, and only these amounts are for sale. */
export const API_CREDIT_PACKS = [5_000, 20_000, 100_000];
export const API_CREDIT_PARSE = /^api-credit-(\d{4,6})$/;

/** Developer API plans. Not for sale yet. */
export const PLANS: Plan[] = [
  {
    id: "api-starter",
    name: "API Starter",
    purpose: "API",
    description: "Voice Verse API access",
    amountNaira: null, // not decided yet
    enabled: false,
  },
];

/** Plans a customer can actually buy right now. */
export const sellable = (plans?: Plan[]) => {
  const all = plans ?? [...PLANS, ...BUNDLES.map((b) => resolvePlan(b.id)!), resolvePlan("listener-pass")!, ...API_CREDIT_PACKS.map((n) => resolvePlan(`api-credit-${n}`)!)];
  return all.filter((p) => p.enabled && typeof p.amountNaira === "number" && p.amountNaira > 0);
};
