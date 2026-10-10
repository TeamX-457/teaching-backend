import { db } from "@/config/db/db";
import { contactMessages } from "@/models/schema";
import { createRateLimiter } from "@/utils/rate-limit";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  topic: z.enum(["question", "pilot", "feedback", "accessibility", "other"]),
  message: z.string().trim().min(5).max(4000),
  // Honeypot: real people leave it empty.
  website: z.string().max(0).optional(),
});

const allow = createRateLimiter(5, 10 * 60_000);

// Prefix: /api
async function contactRoutes(app: FastifyInstance) {
  app.post("/contact", async (req, res) => {
    if (!allow(req.ip)) {
      return res.code(429).send({ error: "Too many messages. Please try again later.", code: "RATE_LIMITED" });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.code(400).send({ error: "Please check the form and try again.", issues: parsed.error.issues });
    }
    const { website: _hp, ...data } = parsed.data;
    await db.insert(contactMessages).values(data);
    return res.code(201).send({ ok: true });
  });
}

export default contactRoutes;