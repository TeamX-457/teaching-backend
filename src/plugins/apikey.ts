import type { FastifyReply, FastifyRequest } from "fastify";
import { apiKeysService } from "@/services/apikeys.service";
import { createRateLimiter } from "@/utils/rate-limit";

/** Errors use one shape everywhere in /v1: { error: { message, type, code } }. */
export const apiError = (message: string, type: string, code: string) => ({ error: { message, type, code } });

export const RATE_LIMIT_PER_MINUTE = Number(process.env.API_RATE_LIMIT ?? 120);

// Per key, so one noisy client cannot starve the others.
const perKey = createRateLimiter(RATE_LIMIT_PER_MINUTE, 60_000);
// Per address, only counting failed attempts, to blunt key guessing.
const failedAttempts = createRateLimiter(30, 60_000);

/** Reads `Authorization: Bearer vv_...` (or `x-api-key`). */
export function readKey(req: FastifyRequest): string {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1];
  if (bearer) return bearer;
  const header = req.headers["x-api-key"];
  return typeof header === "string" ? header.trim() : "";
}

/** preHandler for /v1 routes that need a key. */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply) {
  const secret = readKey(req);
  if (!secret) {
    return reply
      .code(401)
      .header("WWW-Authenticate", "Bearer")
      .send(apiError("Missing API key. Send it as 'Authorization: Bearer vv_...'.", "authentication_error", "missing_api_key"));
  }
  const key = await apiKeysService.verify(secret);
  if (!key) {
    if (!failedAttempts(req.ip)) {
      return reply
        .code(429)
        .header("Retry-After", "60")
        .send(apiError("Too many failed attempts. Try again in a minute.", "rate_limit_error", "too_many_failed_attempts"));
    }
    return reply
      .code(401)
      .header("WWW-Authenticate", "Bearer")
      .send(apiError("That API key is not valid, or it has been revoked.", "authentication_error", "invalid_api_key"));
  }
  if (!perKey(key.id)) {
    return reply
      .code(429)
      .header("Retry-After", "60")
      .send(apiError(`Rate limit reached: ${RATE_LIMIT_PER_MINUTE} requests per minute per key.`, "rate_limit_error", "rate_limit_exceeded"));
  }
  req.apiKey = key;
}
