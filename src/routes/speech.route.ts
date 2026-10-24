import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { apiError } from "@/plugins/apikey";
import {
  MAX_SPEECH_CHARS,
  SpeechUnavailable,
  SpeechUnsupported,
  speechConfigured,
  synthesize,
} from "@/services/speech.service";
import { createRateLimiter } from "@/utils/rate-limit";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_SPEECH_CHARS),
  language: z.string().trim().toLowerCase().min(2).max(8),
  voice: z.enum(["female", "male"]).default("female"),
  rate: z.number().min(0.5).max(2).default(1),
});

// Speech costs money per character: cap the public endpoint per address.
const allow = createRateLimiter(40, 60_000);

/**
 * Shared by POST /api/speech (public) and POST /v1/speech (API key).
 * `v1` only changes the shape of error bodies.
 */
export function speechHandler(v1: boolean) {
  const fail = (res: FastifyReply, status: number, code: string, message: string) =>
    res.code(status).send(v1 ? apiError(message, status === 429 ? "rate_limit_error" : "invalid_request_error", code) : { error: message, code });

  return async (req: FastifyRequest, res: FastifyReply) => {
    if (!v1 && !allow(req.ip)) return fail(res, 429, "RATE_LIMITED", "Too many requests. Slow down.");
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail(res, 400, v1 ? "invalid_request" : "INVALID_REQUEST", `${first?.path.join(".") || "request"}: ${first?.message ?? "invalid"}`);
    }
    const { text, language, voice, rate } = parsed.data;
    try {
      const audio = await synthesize(text, language, voice, rate);
      return res
        .header("Content-Type", "audio/mpeg")
        .header("Cache-Control", "private, max-age=3600")
        .send(audio);
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
