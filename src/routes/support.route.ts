import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isOurs, makeReference, paystackMetadata, paystackService, PaystackError } from "@/services/paystack.service";
import { createRateLimiter } from "@/utils/rate-limit";

const MIN_NGN = Number(process.env.SUPPORT_MIN_NGN ?? 500);
const MAX_NGN = Number(process.env.SUPPORT_MAX_NGN ?? 1_000_000);

const checkoutSchema = z.object({
  amountNgn: z.number().int().min(MIN_NGN).max(MAX_NGN),
  // Needed when not signed in; a signed-in account's own email is used otherwise.
  email: z.string().trim().email().max(200).optional(),
});

const allow = createRateLimiter(10, 10 * 60_000);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const sessionEmail = async (req: FastifyRequest) =>
  (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null))?.user?.email;

// Prefix: /api/support. One-time gifts through Paystack; paying unlocks nothing.
async function supportRoutes(app: FastifyInstance) {
  app.post("/checkout", async (req, res) => {
    if (!allow(req.ip)) {
      return res.code(429).send({ error: "Too many attempts. Please try again later.", code: "RATE_LIMITED" });
    }
    if (!paystackService.configured()) {
      return res.code(503).send({ error: "Payments aren't available right now.", code: "PAYMENTS_UNAVAILABLE" });
    }
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .code(400)
        .send({ error: `Choose an amount from ₦${MIN_NGN} to ₦${MAX_NGN}.`, code: "INVALID_INPUT", issues: parsed.error.issues });
    }
    const email = parsed.data.email ?? (await sessionEmail(req));
    if (!email) {
      return res.code(400).send({ error: "An email is needed for your receipt.", code: "EMAIL_REQUIRED" });
    }

    const reference = makeReference("SUPPORT");
    const publicUrl = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.headers.host}`).replace(/\/$/, "");
    try {
      const data = await paystackService.initialize({
        email,
        amountKobo: parsed.data.amountNgn * 100,
        reference,
        callbackUrl: `${publicUrl}/api/support/return`,
        metadata: paystackMetadata("SUPPORT", "Support for Voice Verse"),
      });
      return res.code(201).send({ reference, authorizationUrl: data.authorization_url });
    } catch (err) {
      req.log.error({ err, reference }, "Paystack initialize failed");
      return res.code(502).send({ error: "Payment couldn't be started. Please try again.", code: "PAYMENT_FAILED" });
    }
  });

  // Where Paystack's checkout sends the payer's browser.
  app.get("/return", async (req, res) => {
    const reference = String((req.query as Record<string, unknown>).reference ?? "");
    let paid = false;
    if (isOurs(reference) && paystackService.configured()) {
      try {
        paid = (await paystackService.verify(reference)).status === "success";
      } catch (err) {
        if (!(err instanceof PaystackError)) throw err;
        req.log.warn({ err, reference }, "Paystack verify failed");
      }
    }
    const title = paid ? "Thank you" : "Payment not confirmed yet";
    const message = paid
      ? "Your support helps keep Voice Verse captions free in classrooms, churches and halls."
      : "If you paid, Paystack will email your receipt shortly.";
    return res
      .type("text/html")
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
          `<title>${title} | Voice Verse</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center">` +
          `<h1>${title}</h1><p>${message}</p><p>Reference: ${escapeHtml(reference)}</p></body></html>`,
      );
  });

  // The webhook needs the exact bytes Paystack signed, so it gets its own scope with a raw-body parser.
  app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    hook.post("/paystack/webhook", async (req, res) => {
      const raw = req.body as Buffer;
      if (!paystackService.signatureOk(raw, req.headers["x-paystack-signature"])) {
        return res.code(400).send({ error: "Invalid signature" });
      }
      let payload: { event?: string; data?: { reference?: string; amount?: number } };
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return res.code(400).send({ error: "Invalid JSON" });
      }
      if (payload.event === "charge.success" && isOurs(payload.data?.reference)) {
        // Gifts unlock nothing, so there is nothing to apply: the record lives in Paystack.
        req.log.info({ reference: payload.data?.reference, amount: payload.data?.amount }, "Support payment received");
      }
      return { received: true };
    });
  });
}

export default supportRoutes;
