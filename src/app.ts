import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import authPlugin from "@/plugins/auth.plugin";

import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";
import subjectRoutes from "@/routes/subject.route";
import lessonRoutes from "@/routes/lesson.route";
import liveRoutes from "@/routes/live.route";
import translateRoutes from "@/routes/translate.route";
import contactRoutes from "@/routes/contact.route";
import keysRoutes from "@/routes/keys.route";
import billingRoutes from "@/routes/billing.route";
import paymentsRoutes from "@/routes/payments.route";
import speechRoutes from "@/routes/speech.route";
import v1Routes from "@/routes/v1.route";
import supportRoutes from "@/routes/support.route";
import cors, { type FastifyCorsOptionsDelegate } from "@fastify/cors";
import { isAllowedOrigin, isPublicApiPath } from "@/config/origins";

export const buildApp = async (opts = {}) => {
  const app = Fastify({
    logger: true,
    ...opts,
  });
  // Browsers may call the account API (cookie login) only from our own sites (src/config/origins.ts).
  // The public /v1 API takes a bearer key and no cookie, so any website may call it.
  await app.register(cors, (_instance: FastifyInstance): FastifyCorsOptionsDelegate => (req, callback) => {
    const origin = req.headers.origin;
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
    if (isPublicApiPath(req.url)) return callback(null, { origin: true, credentials: false, methods });
    // No Origin header means it is not a browser (the app, VisionMirror, curl): CORS does not apply.
    callback(null, { origin: !origin || isAllowedOrigin(origin), credentials: true, methods });
  });

  // Second layer behind SameSite cookies: a request that CHANGES something and says it comes from a website we do not
  // run is refused. This protects accounts, keys and payments, and stops other websites spending the translation and
  // speech credit through the public endpoints. Not affected: reads, the bearer-key /v1 API, server-to-server calls
  // (they send no Origin), and Paystack's signed webhooks.
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
    const origin = req.headers.origin;
    if (!origin || isAllowedOrigin(origin) || isPublicApiPath(req.url)) return;
    if (/^\/api\/(payments\/webhook|support\/paystack\/webhook)(\?|$)/.test(req.url)) return;
    return reply.code(403).send({ error: "This website is not allowed to do that.", code: "ORIGIN_NOT_ALLOWED" });
  });

  // Safe defaults on every response, and nothing about accounts, keys or payments is ever cached.
  app.addHook("onSend", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (/^\/api\/(auth|keys|payments)/.test(req.url) && !reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
  });

  app.register(authPlugin);

  app.get("/api/health", (req: FastifyRequest, res: FastifyReply) => {
    res.code(200).send({
      status: "ok",
      timestamp: new Date().toISOString().split("T")[0],
    });
  });
  // Register authentication endpoint
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request: FastifyRequest, reply: FastifyReply) {
      try {
        // Construct request URL
        const url = new URL(request.url, `http://${request.headers.host}`);

        // Convert Fastify headers to standard Headers object
        const headers = fromNodeHeaders(request.headers);

        // Create Fetch API-compatible request
        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });

        // Process authentication request
        const response = await auth.handler(req);

        // Forward response to client
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE",
        });
      }
    },
  });

  app.register(subjectRoutes, { prefix: "/api/subjects" });
  app.register(lessonRoutes, { prefix: "/api/lessons" });
  app.register(liveRoutes, { prefix: "/api/live" });
  app.register(translateRoutes, { prefix: "/api" });
  app.register(contactRoutes, { prefix: "/api" });
  app.register(speechRoutes, { prefix: "/api" });
  app.register(paymentsRoutes, { prefix: "/api/payments" });
  app.register(billingRoutes, { prefix: "/api/billing" });
  // One-time support payments through the shared Paystack account (references start VOICEVERSE-).
  app.register(supportRoutes, { prefix: "/api/support" });
  // Developer API: people manage keys under /api/keys; programs call /v1 with a key.
  app.register(keysRoutes, { prefix: "/api/keys" });
  app.register(v1Routes, { prefix: "/v1" });

  return app;
};
