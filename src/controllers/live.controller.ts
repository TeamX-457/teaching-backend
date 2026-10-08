import { auth } from "@/lib/auth";
import { liveService } from "@/services/live.service";
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
});

const captionSchema = z.object({ text: z.string().trim().min(1).max(1000) });

const captionsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  lang: langSchema.optional(),
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

export const liveController = {
  async createSession(req: FastifyRequest, res: FastifyReply) {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const hostId = await currentUserId(req);
    if (!hostId) return res.code(401).send({ error: "Unauthorized" });

    const session = await liveService.createSession({ ...parsed.data, hostId });
    return res.code(201).send({ session });
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
    const { hostId: _hostId, ...publicSession } = session;
    return res.send({ session: publicSession });
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
    return res.code(201).send({ caption });
  },

  // Listeners poll this with the last `seq` they have seen.
  async getCaptions(req: FastifyRequest<CodeParams>, res: FastifyReply) {
    const parsed = captionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const { after, lang } = parsed.data;

    const session = await liveService.getByCode(
      normalizeJoinCode(req.params.code),
    );
    if (!session) return res.code(404).send({ error: "Session not found" });

    const rows = await liveService.getCaptions(session.id, after);

    const target = lang && lang !== session.sourceLang ? lang : undefined;
    const glossary = target
      ? await liveService.getGlossary(session.sourceLang, target)
      : [];

    const captions = await Promise.all(
      rows.map(async (row) => {
        if (!target) return { ...row, translatedText: null, translated: false };
        const t = await translate(row.text, session.sourceLang, target, glossary);
        return {
          ...row,
          translatedText: t.translated ? t.text : null,
          translated: t.translated,
        };
      }),
    );

    return res.send({ status: session.status, captions });
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

  async stats(_req: FastifyRequest, res: FastifyReply) {
    return res.send(await liveService.getStats());
  },
};
