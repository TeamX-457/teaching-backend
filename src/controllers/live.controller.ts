import { checkTranslationPair, getLanguage } from "@/config/languages";
import { auth } from "@/lib/auth";
import { invitesService } from "@/services/invites.service";
import {
  balanceFor,
  billingEnforced,
  meter,
  paidFeaturesOn,
  secondsAvailable,
  type Clock,
} from "@/services/billing.service";
import { waitForCaption } from "@/services/caption-hub";
import { liveService } from "@/services/live.service";
import { spitchAvailable } from "@/services/spitch.service";
import { MAX_VOICE_LANGUAGES, type Tier } from "@/config/pricing";
import { translate } from "@/services/translation.service";
import { normalizeJoinCode } from "@/utils/join-code";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const langSchema = z.string().trim().min(2).max(8).toLowerCase();

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  venueType: z
    .enum(["classroom", "conference", "church", "town_hall", "other"])
    .default("classroom"),
  sourceLang: langSchema.default("en"),
  // What the host is paying for, how many languages speak aloud, and how long the session may run.
  tier: z.enum(["captions", "standard", "local"]).optional(),
  voiceLanguages: z.number().int().min(1).max(MAX_VOICE_LANGUAGES).default(1),
  capMinutes: z.number().int().min(5).max(720).optional(),
});

const captionSchema = z.object({ text: z.string().trim().min(1).max(1000) });

const captionsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  lang: langSchema.optional(),
  // Seconds to wait for a new caption before answering empty. 0 answers at once (the old behaviour).
  wait: z.coerce.number().int().min(0).max(20).default(0),
});

const feedbackSchema = z.object({
  code: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

const glossarySchema = z.object({
  sourceLang: langSchema.default("en"),
  targetLang: langSchema,
  terms: z
    .array(
      z.object({
        sourceText: z.string().trim().min(1).max(200),
        targetText: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(500),
});

const inviteSchema = z.object({ identifier: z.string().trim().min(2).max(200) });

type CodeParams = { Params: { code: string } };

async function currentUserId(req: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  return session?.user.id;
}

function invalid(res: FastifyReply, error: z.ZodError) {
  return res.code(400).send({ error: "Invalid request", issues: error.issues });
}

/** The session's clock, counted up to now. Charges the host for the time since the last look. */
async function meterSession(session: NonNullable<Awaited<ReturnType<typeof liveService.getByCode>>>) {
  const clock: Clock = { ...session, tier: session.tier };
  const r = await meter(session.hostId, clock, liveService.clockStore(session.id), { localUp: spitchAvailable() });
  return { clock, secondsLeft: r.secondsLeft };
}

/** What listeners may know about how a session is paid for. Nothing about money. */
const publicBilling = (c: Pick<Clock, "tier" | "stoppedReason" | "status">) => ({
  tier: c.tier,
  voice: !paidFeaturesOn(c) ? "none" : c.tier === "local" ? "local" : c.tier === "standard" ? "standard" : "none",
  translation: billingEnforced() ? paidFeaturesOn(c) : true,
  stopped: c.stoppedReason,
});

export const liveController = {
  async createSession(req: FastifyRequest, res: FastifyReply) {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });

    // A session runs at the level the host chose, and needs time bought at that level (everyone has a little free
    // captions time each month). While billing is not switched on, a host with no time still gets a plain session.
    const wanted: Tier = parsed.data.tier ?? "captions";
    const available = await secondsAvailable(hostId, wanted);
    const haveTime = available >= 10 * 60;
    if (!haveTime && (billingEnforced() || parsed.data.tier)) {
      return res.code(402).send({
        error: "You need more time for that. Buy hours or a plan to start this session.",
        code: "NO_TIME",
        balance: await balanceFor(hostId),
      });
    }
    const { capMinutes, tier: _t, ...rest } = parsed.data;
    const session = await liveService.createSession({
      ...rest,
      hostId,
      tier: haveTime ? wanted : "free",
      capSeconds: capMinutes ? capMinutes * 60 : null,
    });
    return res.code(201).send({ session });
  },

  /** For the host: how much time is left, the session's length so far, and when it will stop. */
  async usage(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });
    const found = await liveService.getByCode(normalizeJoinCode(req.params.code));
    if (!found || found.hostId !== hostId) return res.code(404).send({ error: "Session not found" });
    const { clock } = await meterSession(found);
    const left = found.tier === "free" ? null : await secondsAvailable(hostId, found.tier as Tier);
    return res.send({
      tier: clock.tier,
      voiceLanguages: clock.voiceLanguages,
      capSeconds: clock.capSeconds,
      sessionSeconds: clock.meteredSeconds,
      pausedSeconds: clock.pausedSeconds,
      secondsLeft: left,
      secondsUntilCap: clock.capSeconds ? Math.max(0, clock.capSeconds - clock.meteredSeconds) : null,
      backupVoice: Boolean(clock.fallbackUntil && clock.fallbackUntil > new Date()),
      stopped: clock.stoppedReason,
      balance: await balanceFor(hostId),
    });
  },

  async mySessions(req: FastifyRequest, res: FastifyReply) {
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });
    return res.send({ sessions: await liveService.listForHost(hostId) });
  },

  async getSession(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const session = await liveService.getByCode(
      normalizeJoinCode(req.params.code),
    );
    if (!session) return res.code(404).send({ error: "Session not found" });
    const { hostId: _hostId, voiceLanguages: _v, capSeconds: _c, meteredSeconds: _m, pausedSeconds: _p, graceSeconds: _g, lastMeterAt: _l, fallbackUntil: _f, tier: _t, stoppedReason: _s, ...publicSession } = session;
    return res.send({ session: { ...publicSession, billing: publicBilling(session) } });
  },

  async joinSession(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const session = await liveService.getByCode(
      normalizeJoinCode(req.params.code),
    );
    if (!session) return res.code(404).send({ error: "Session not found" });
    await liveService.registerListener(session.id);
    return res.send({ ok: true, status: session.status });
  },

  async endSession(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });
    const session = await liveService.endSession(
      normalizeJoinCode(req.params.code),
      hostId,
    );
    if (!session) return res.code(404).send({ error: "Session not found" });
    return res.send({ session });
  },

  async addCaption(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const parsed = captionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });

    const session = await liveService.getByCode(
      normalizeJoinCode(req.params.code),
    );
    if (!session) return res.code(404).send({ error: "Session not found" });
    if (session.hostId !== hostId) {
      return res.code(403).send({ error: "Only the host can add captions" });
    }
    if (session.status !== "live") {
      return res.code(409).send({ error: "Session has ended" });
    }
    const caption = await liveService.addCaption(session.id, parsed.data.text);
    const { clock, secondsLeft } = await meterSession(session);
    return res.code(201).send({
      caption,
      billing: { tier: clock.tier, secondsLeft, stopped: clock.stoppedReason, capReached: clock.stoppedReason === "cap_reached" },
    });
  },

  // Listeners poll this with the last `seq` they have seen.
  async getCaptions(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const parsed = captionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const { after, lang, wait } = parsed.data;

    let session = await liveService.getByCode(
      normalizeJoinCode(req.params.code),
    );
    if (!session) return res.code(404).send({ error: "Session not found" });

    let rows = await liveService.getCaptions(session.id, after);
    if (!rows.length && wait > 0 && session.status === "live") {
      // Nothing new yet: hold the request and answer the moment the speaker's next line arrives.
      const id = session.id;
      const arrived = await waitForCaption(id, after, wait * 1000, (sid) => liveService.latestSeq(sid));
      if (arrived) rows = await liveService.getCaptions(id, after);
      session = (await liveService.getByCode(normalizeJoinCode(req.params.code))) ?? session;
    }
    // Listeners fetching captions is what keeps the clock moving while the host is quiet.
    const { clock } = await meterSession(session);
    // Translation costs money: it runs only while the host's time is on (or while billing is not switched on yet).
    const mayTranslate = billingEnforced() ? paidFeaturesOn(clock) : true;

    const target = mayTranslate && lang && lang !== session.sourceLang ? lang : undefined;
    if (target) {
      const pair = checkTranslationPair(session.sourceLang, target);
      if (!pair.ok) {
        return res.code(400).send({ error: pair.message, code: pair.code });
      }
    }
    const glossary = target
      ? await liveService.getGlossary(session.sourceLang, target)
      : [];
    const names = target
      ? {
          source: getLanguage(session.sourceLang)!.name,
          target: getLanguage(target)!.name,
        }
      : undefined;

    const captions = await Promise.all(
      rows.map(async (row) => {
        if (!target) return { ...row, translatedText: null, translated: false };
        const t = await translate(
          row.text,
          session.sourceLang,
          target,
          glossary,
          names,
        );
        return {
          ...row,
          translatedText: t.translated ? t.text : null,
          translated: t.translated,
        };
      }),
    );

    return res.send({ status: session.status, captions, billing: publicBilling(clock) });
  },

  async addFeedback(req: FastifyRequest, res: FastifyReply) {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const { code, rating, comment } = parsed.data;

    let sessionId: string | undefined;
    if (code) {
      const session = await liveService.getByCode(normalizeJoinCode(code));
      if (!session) return res.code(404).send({ error: "Session not found" });
      sessionId = session.id;
    }
    const row = await liveService.addFeedback({ sessionId, rating, comment });
    return res.code(201).send({ feedback: row });
  },

  async upsertGlossary(req: FastifyRequest, res: FastifyReply) {
    const parsed = glossarySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const { sourceLang, targetLang, terms } = parsed.data;
    const saved = await liveService.upsertGlossaryTerms(
      terms.map((t) => ({ ...t, sourceLang, targetLang })),
    );
    return res.code(201).send({ saved: saved.length });
  },

  async getGlossary(
    req: FastifyRequest<{ Querystring: { target?: string; source?: string } }>,
    res: FastifyReply,
  ) {
    const parsed = z
      .object({ target: langSchema, source: langSchema.default("en") })
      .safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const terms = await liveService.getGlossary(
      parsed.data.source,
      parsed.data.target,
    );
    return res.send({ terms });
  },

  // ---- Invitations (host only, except myInvites) --------------------------
  async inviteToSession(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });
    const session = await liveService.getByCode(normalizeJoinCode(req.params.code));
    if (!session || session.hostId !== hostId) return res.code(404).send({ error: "Session not found" });
    const r = await invitesService.invite(session.id, hostId, parsed.data.identifier);
    if (!r.ok) return res.code(r.code === "DUPLICATE" ? 409 : r.code === "NOT_FOUND" ? 404 : 422).send({ error: r.message, code: r.code });
    return res.code(201).send({ invite: r.invite });
  },

  async listInvites(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });
    const session = await liveService.getByCode(normalizeJoinCode(req.params.code));
    if (!session || session.hostId !== hostId) return res.code(404).send({ error: "Session not found" });
    return res.send({ invites: await invitesService.list(session.id) });
  },

  async removeInvite(req: FastifyRequest<{ Params: { code: string; inviteId: string } }>, res: FastifyReply) {
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });
    const session = await liveService.getByCode(normalizeJoinCode(req.params.code));
    if (!session || session.hostId !== hostId) return res.code(404).send({ error: "Session not found" });
    const ok = await invitesService.remove(session.id, req.params.inviteId);
    return ok ? res.send({ ok: true }) : res.code(404).send({ error: "Invitation not found" });
  },

  async myInvites(req: FastifyRequest, res: FastifyReply) {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!s) return res.code(401).send({ error: "Unauthorized" });
    return res.send({ sessions: await invitesService.forUser(s.user.id, s.user.email) });
  },

  async stats(_req: FastifyRequest, res: FastifyReply) {
    return res.send(await liveService.getStats());
  },
};
