import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import {
  BUNDLES,
  BUNDLE_DAYS,
  BULK_DISCOUNT,
  BULK_HOURS,
  DAY_HOURS,
  GRACE_SECONDS,
  HOUR_CHOICES,
  LISTENER_PASS_DAYS,
  LISTENER_PASS_NAIRA,
  LISTENER_TRIAL_SECONDS,
  MAX_HOURS,
  MAX_VOICE_LANGUAGES,
  MIN_HOURS,
  bundleGrants,
  hoursPrice,
  type Tier,
} from "@/config/pricing";
import { auth } from "@/lib/auth";
import { balanceFor, listenerAccess } from "@/services/billing.service";

const currentUser = async (req: FastifyRequest) =>
  (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user;

const LEVELS: { tier: Tier; name: string; about: string }[] = [
  { tier: "captions", name: "Captions", about: "Translated captions. Listeners can have them read aloud by their own phone." },
  { tier: "standard", name: "Standard voice", about: "Captions plus a clear Nigerian-English voice reading the translation aloud." },
  { tier: "local", name: "Local voice", about: "Captions plus a real Hausa, Yoruba or Igbo voice. The most natural way to listen." },
];

const quoteSchema = z.object({
  tier: z.enum(["captions", "standard", "local"]),
  minutes: z.number().int().min(5).max(720),
  voiceLanguages: z.number().int().min(1).max(MAX_VOICE_LANGUAGES).default(1),
});

// Prefix: /api/billing
async function billingRoutes(app: FastifyInstance) {
  // What is for sale. Shows prices for a plan or a number of hours, never a rate per minute or per word.
  app.get("/pricing", async (_req, res) => {
    res.header("Cache-Control", "public, max-age=300");
    return {
      currency: "NGN",
      levels: LEVELS,
      hours: {
        min: MIN_HOURS,
        max: MAX_HOURS,
        dayHours: DAY_HOURS,
        choices: HOUR_CHOICES,
        prices: Object.fromEntries(
          LEVELS.map((l) => [l.tier, Object.fromEntries(HOUR_CHOICES.map((h) => [h, hoursPrice(l.tier, h)]))]),
        ),
        bulk: { fromHours: BULK_HOURS, discountPercent: Math.round(BULK_DISCOUNT * 100) },
      },
      plans: BUNDLES.map((b) => ({
        id: b.id,
        event: b.event,
        tier: b.tier,
        name: b.name,
        hours: b.hours,
        amount: b.amountNaira,
        includes: bundleGrants(b).map((g) => ({ tier: g.tier, hours: g.hours })),
        about: b.description,
      })),
      listener: {
        id: "listener-pass",
        amount: LISTENER_PASS_NAIRA,
        days: LISTENER_PASS_DAYS,
        trialMinutes: Math.round(LISTENER_TRIAL_SECONDS / 60),
        about: "Hear the real local voice in any session whose host has turned it on. Listening in text and with your phone's voice is always free.",
      },
      rules: {
        validDays: BUNDLE_DAYS,
        refundable: false,
        graceMinutes: Math.round(GRACE_SECONDS / 60),
        extraVoiceLanguages: `Each extra language that speaks aloud uses your hours at the same speed (up to ${MAX_VOICE_LANGUAGES} at once).`,
      },
    };
  });

  // The signed-in person's time left, listener pass and trial.
  app.get("/me", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    res.header("Cache-Control", "no-store");
    return { balance: await balanceFor(me.id), listener: await listenerAccess(me.id) };
  });

  // "If I run this session, how much of my time does it use?" Shown before a session starts.
  app.post("/estimate", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    const q = quoteSchema.safeParse(req.body);
    if (!q.success) return res.code(400).send({ error: "Choose a level and a length.", code: "INVALID_REQUEST" });
    const lanes = q.data.tier === "captions" ? 1 : q.data.voiceLanguages;
    const usesSeconds = q.data.minutes * 60 * lanes;
    const bal = await balanceFor(me.id);
    const left = bal[q.data.tier].seconds;
    const hoursShort = Math.max(0, Math.ceil((usesSeconds - left) / 3600));
    res.header("Cache-Control", "no-store");
    return {
      usesHours: Math.round((usesSeconds / 3600) * 100) / 100,
      haveHours: Math.round((left / 3600) * 100) / 100,
      leftAfterHours: Math.max(0, Math.round(((left - usesSeconds) / 3600) * 100) / 100),
      enough: usesSeconds <= left,
      buyHours: hoursShort,
      buyPrice: hoursShort > 0 ? hoursPrice(q.data.tier, Math.max(MIN_HOURS, hoursShort)) : 0,
      buyPlan: hoursShort > 0 ? `hours-${q.data.tier}-${Math.max(MIN_HOURS, Math.min(MAX_HOURS, hoursShort))}` : null,
    };
  });
}

export default billingRoutes;
