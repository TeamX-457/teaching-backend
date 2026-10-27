import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiError } from "@/plugins/apikey";
import { MAX_VOICE_LANGUAGES } from "@/config/pricing";
import { audioSeconds, billingEnforced, dbBilling, decideVoice, listenerAccess, meter, soloCharge, type Clock } from "@/services/billing.service";
import { liveService } from "@/services/live.service";
import {
  MAX_SPEECH_CHARS,
  SpeechUnavailable,
  SpeechUnsupported,
  speechConfigured,
  synthesizeDetailed,
} from "@/services/speech.service";
import { spitchAvailable, spitchSpeaks } from "@/services/spitch.service";
import { normalizeJoinCode } from "@/utils/join-code";
import { createRateLimiter } from "@/utils/rate-limit";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_SPEECH_CHARS),
  language: z.string().trim().toLowerCase().min(2).max(8),
  voice: z.enum(["female", "male"]).default("female"),
  rate: z.number().min(0.5).max(2).default(1),
  // The live session this listener is in. The host's plan decides which voice they may have.
  session: z.string().trim().min(3).max(12).optional(),
});

/** Voice languages recently asked for in each session, so a host cannot get more voices than they paid for. */
const lanes = new Map<string, Map<string, number>>();
const LANE_WINDOW_MS = 5 * 60_000;
function laneAllowed(sessionId: string, language: string, max: number, now = Date.now()) {
  let m = lanes.get(sessionId);
  if (!m) lanes.set(sessionId, (m = new Map()));
  for (const [l, t] of m) if (now - t > LANE_WINDOW_MS) m.delete(l);
  if (!m.has(language) && m.size >= max) return false;
  m.set(language, now);
  if (lanes.size > 500) lanes.delete(lanes.keys().next().value!);
  return true;
}

// Speech costs money per character: cap the public endpoint per address.
const allow = createRateLimiter(40, 60_000);

/**
 * Shared by POST /api/speech (public) and POST /v1/speech (API key).
 * `v1` only changes the shape of error bodies.
 */
export function speechHandler(v1: boolean, billed?: (req: FastifyRequest, spoken: { seconds: number; local: boolean }) => Promise<void>) {
  const fail = (res: FastifyReply, status: number, code: string, message: string) =>
    res.code(status).send(v1 ? apiError(message, status === 429 ? "rate_limit_error" : "invalid_request_error", code) : { error: message, code });

  return async (req: FastifyRequest, res: FastifyReply) => {
    if (!v1 && !allow(req.ip)) return fail(res, 429, "RATE_LIMITED", "Too many requests. Slow down.");
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail(res, 400, v1 ? "invalid_request" : "INVALID_REQUEST", `${first?.path.join(".") || "request"}: ${first?.message ?? "invalid"}`);
    }
    const { text, language, voice, rate, session: sessionCode } = parsed.data;
    try {
      // Developers with an API key are billed separately (not built yet): they always get the best voice.
      let native = true;
      let sessionRow: Awaited<ReturnType<typeof liveService.getByCode>> | undefined;
      let reason = "api";
      let listenerId: string | undefined;
      if (!v1) {
        sessionRow = sessionCode ? await liveService.getByCode(normalizeJoinCode(sessionCode)) : undefined;
        if (!sessionRow && billingEnforced()) {
          // Speaking for yourself, with no live session: the voice comes out of your own time, best voice first.
          const me = (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user;
          if (!me) return fail(res, 401, "SIGN_IN_REQUIRED", "Sign in to hear the voice.");
          const secs = audioSeconds(text);
          const level = await soloCharge(me.id, secs, spitchSpeaks(language) ? ["local", "standard"] : ["standard"]);
          if (!level) return fail(res, 402, "OUT_OF_TIME", "You have no voice time left. Buy hours to carry on.");
          native = level === "local";
          reason = "solo";
        }
        if (sessionRow && (billingEnforced() || sessionRow.tier !== "free")) {
          const clock: Clock = { ...sessionRow };
          await meter(sessionRow.hostId, clock, liveService.clockStore(sessionRow.id), { localUp: spitchAvailable() });
          listenerId = (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user.id;
          const d = decideVoice(clock, spitchSpeaks(language), await listenerAccess(listenerId));
          if (!d.allowed) return fail(res, 402, "VOICE_NOT_AVAILABLE", d.reason === "out_of_time" ? "The host's time has run out." : "This session has no spoken voice. Your phone's own voice is used instead.");
          if (!laneAllowed(sessionRow.id, language, sessionRow.voiceLanguages ?? 1)) {
            return fail(res, 402, "VOICE_LANGUAGE_LIMIT", `This session speaks aloud in up to ${Math.min(sessionRow.voiceLanguages ?? 1, MAX_VOICE_LANGUAGES)} language(s).`);
          }
          native = d.native;
          reason = d.reason;
        }
      }
      const spoken = await synthesizeDetailed(text, language, voice, rate, { native });
      if (v1 && billed) await billed(req, { seconds: audioSeconds(text), local: spoken.engine === "spitch" });
      res.header("X-Voice", spoken.engine === "spitch" ? "local" : "standard").header("X-Voice-Reason", reason);
      if (sessionRow && spoken.fellBack) {
        // Our side failed: the host is not charged while the backup voice is speaking.
        await liveService.markFallback(sessionRow.id, new Date(Date.now() + 60_000));
        res.header("X-Voice-Backup", "1");
      }
      if (sessionRow && spoken.engine === "spitch" && reason === "trial" && listenerId) {
        const used = await dbBilling.addTrial(listenerId, audioSeconds(text));
        res.header("X-Trial-Seconds-Used", String(used));
      }
      return res
        .header("Content-Type", "audio/mpeg")
        .header("Cache-Control", "private, max-age=3600")
        .header("Access-Control-Expose-Headers", "X-Voice, X-Voice-Reason, X-Voice-Backup, X-Trial-Seconds-Used")
        .send(spoken.audio);
    } catch (e) {
      if (e instanceof SpeechUnsupported) {
        return fail(res, 422, v1 ? "no_voice" : "NO_VOICE", "There is no voice for that language yet.");
      }
      if (!speechConfigured()) {
        return fail(res, 501, v1 ? "speech_unavailable" : "SPEECH_UNAVAILABLE", "Spoken audio is not set up on this server.");
      }
      if (e instanceof SpeechUnavailable) {
        return fail(res, 502, v1 ? "speech_failed" : "SPEECH_FAILED", "The voice service did not answer. Try again.");
      }
      throw e;
    }
  };
}

// Prefix: /api
async function speechRoutes(app: FastifyInstance) {
  app.post("/speech", speechHandler(false));
}

export default speechRoutes;
