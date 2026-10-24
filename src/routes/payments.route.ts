import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { sellable } from "@/config/pricing";
import { auth } from "@/lib/auth";
import {
  PaymentError,
  dbStore,
  createCheckout,
  handleWebhookEvent,
  publicPayment,
  settle,
} from "@/services/payments.service";
import { isOurs } from "@/services/paystack.naming";
import { PaystackError, paystackConfigured, verifyWebhookSignature } from "@/services/paystack.service";
import { createRateLimiter } from "@/utils/rate-limit";

// Where Paystack sends the customer after paying: this API's own confirmation page, so it works with no website page.
const PUBLIC_API_URL = () => (process.env.PUBLIC_API_URL || "https://voiceverse-rose.vercel.app").replace(/\/$/, "");
const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const checkoutSchema = z.object({ plan: z.string().trim().min(1).max(60) });
const referenceSchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9.=-]+$/);

const checkoutLimit = createRateLimiter(10, 60_000);
const verifyLimit = createRateLimiter(30, 60_000);

const currentUser = async (req: FastifyRequest) =>
  (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user;

// Prefix: /api/payments
async function paymentsRoutes(app: FastifyInstance) {
  // What can be bought. Prices come from the server (src/config/pricing.ts), never from the app.
  app.get("/plans", async () => ({
    configured: paystackConfigured(),
    plans: paystackConfigured()
      ? sellable().map((p) => ({ id: p.id, name: p.name, description: p.description, amount: p.amountNaira, currency: "NGN" }))
      : [],
  }));

  app.post("/checkout", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    if (!checkoutLimit(me.id)) return res.code(429).send({ error: "Too many attempts. Wait a minute.", code: "RATE_LIMITED" });
    if (!paystackConfigured()) return res.code(501).send({ error: "Payments are not set up yet.", code: "PAYMENTS_UNAVAILABLE" });
    const body = checkoutSchema.safeParse(req.body);
    if (!body.success) return res.code(400).send({ error: "Choose a plan.", code: "INVALID_REQUEST" });
    try {
      const r = await createCheckout({
        user: { id: me.id, email: me.email },
        planId: body.data.plan,
        callbackUrl: `${PUBLIC_API_URL()}/api/payments/return`,
      });
      res.header("Cache-Control", "no-store");
      return r;
    } catch (e) {
      if (e instanceof PaymentError) return res.code(e.status).send({ error: e.message, code: e.code });
      throw e;
    }
  });

  // Where Paystack sends the customer's browser. The result is confirmed with Paystack itself, never taken from the
  // URL. Safe without a login: it only reports the status of a reference, and settling is idempotent.
  app.get("/return", async (req, res) => {
    const reference = String((req.query as Record<string, unknown>).reference ?? (req.query as Record<string, unknown>).trxref ?? "");
    let status: "success" | "pending" | "failed" = "pending";
    if (referenceSchema.safeParse(reference).success && isOurs(reference) && paystackConfigured()) {
      try {
        const row = await settle(reference);
        if (row?.status === "success") status = "success";
        else if (row?.status === "failed" || row?.status === "mismatch") status = "failed";
      } catch (e) {
        if (!(e instanceof PaystackError)) throw e;
        req.log.warn({ reference }, "Paystack verify failed on return");
      }
    }
    const title = status === "success" ? "Thank you" : status === "failed" ? "Payment was not completed" : "Payment not confirmed yet";
    const message =
      status === "success"
        ? "Your payment was received. You can close this page and return to Voice Verse."
        : status === "failed"
          ? "No money was taken for this attempt. You can go back to Voice Verse and try again."
          : "If you paid, this can take a minute. Paystack will email your receipt, and Voice Verse will update shortly.";
    return res
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
          `<title>${title} | Voice Verse</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center">` +
          `<h1>${title}</h1><p>${message}</p><p style="color:#666;font-size:.85rem">Reference: ${escapeHtml(reference.slice(0, 120))}</p></body></html>`,
      );
  });

  // The app can also ask directly, signed in, so the result is confirmed with Paystack itself.
  app.get("/verify/:reference", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    if (!verifyLimit(me.id)) return res.code(429).send({ error: "Too many requests.", code: "RATE_LIMITED" });
    const ref = referenceSchema.safeParse((req.params as { reference?: string }).reference);
    if (!ref.success || !isOurs(ref.data)) return res.code(404).send({ error: "Payment not found." });
    const existing = await dbStore.byReference(ref.data);
    if (!existing || existing.userId !== me.id) return res.code(404).send({ error: "Payment not found." }); // not yours: same answer as missing
    try {
      const row = await settle(ref.data);
      return { payment: publicPayment(row ?? existing) };
    } catch (e) {
      if (e instanceof PaystackError) return res.code(502).send({ error: "Could not confirm with Paystack yet. Try again.", code: "GATEWAY_UNAVAILABLE" });
      throw e;
    }
  });

  app.get("/mine", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    res.header("Cache-Control", "no-store");
    let rows = await dbStore.forUser(me.id);
    // Safety net that does not depend on the webhook reaching us: re-check payments still marked pending
    // (the customer may have closed the tab before returning), a few at a time, newest first.
    const pending = rows.filter((p) => p.status === "pending" && Date.now() - p.createdAt.getTime() < 48 * 3_600_000).slice(0, 5);
    if (pending.length) {
      await Promise.allSettled(pending.map((p) => settle(p.reference)));
      rows = await dbStore.forUser(me.id);
    }
    return { payments: rows.map(publicPayment) };
  });

  // Paystack's webhook. It signs the exact bytes it sends, so this route keeps the raw body for the check.
  app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
      try {
        (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
        done(null, body ? JSON.parse(body as string) : {});
      } catch (e) {
        // A body that is not JSON is the sender's mistake (400), not ours (500), so nobody retries it forever.
        const err = e as Error & { statusCode?: number };
        err.statusCode = 400;
        done(err, undefined);
      }
    });

    hook.post("/webhook", async (req, res) => {
      const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? "";
      const signature = req.headers["x-paystack-signature"];
      if (!verifyWebhookSignature(raw, typeof signature === "string" ? signature : undefined)) {
        return res.code(401).send({ error: "Bad signature" });
      }
      try {
        // Answer 200 for events that are not ours: the account is shared and Paystack must not retry them here.
        const result = await handleWebhookEvent(req.body as Parameters<typeof handleWebhookEvent>[0]);
        return { received: true, handled: result.handled };
      } catch (e) {
        // A failure to confirm (Paystack unreachable, database down) must be retried by Paystack.
        req.log.error({ err: e instanceof Error ? e.message : "webhook failed" }, "paystack webhook failed");
        return res.code(500).send({ error: "Try again" });
      }
    });
  });
}

export default paymentsRoutes;
