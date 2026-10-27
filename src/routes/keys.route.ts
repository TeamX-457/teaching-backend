import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiKeysService } from "@/services/apikeys.service";
import { setKeyCap, usageSummary } from "@/services/apibilling.service";

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });
const idSchema = z.object({ id: z.string().uuid() });
const capSchema = z.object({ capNaira: z.number().int().min(100).max(10_000_000).nullable() });
const daysSchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

const currentUser = async (req: FastifyRequest) =>
  (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user;

// Prefix: /api/keys. Signed-in people manage their own keys here.
async function keysRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    return { keys: await apiKeysService.list(me.id) };
  });

  // What was used and what it cost at the billed prices, plus credit left and each key's monthly limit.
  app.get("/usage", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    const q = daysSchema.safeParse(req.query);
    res.header("Cache-Control", "no-store");
    return usageSummary(me.id, q.success ? q.data.days : 30);
  });

  // A monthly spending limit for one key (naira), or null to remove it.
  app.put("/:id/cap", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    const p = idSchema.safeParse(req.params);
    const b = capSchema.safeParse(req.body);
    if (!p.success || !b.success) return res.code(400).send({ error: "Give a limit in naira (at least 100), or null to remove it.", code: "INVALID_CAP" });
    const ok = await setKeyCap(me.id, p.data.id, b.data.capNaira === null ? null : b.data.capNaira * 100);
    if (!ok) return res.code(404).send({ error: "Key not found" });
    apiKeysService.forget(p.data.id);
    return { ok: true };
  });

  app.post("/", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: "Give the key a short name.", code: "INVALID_NAME" });

    const made = await apiKeysService.create(me.id, parsed.data.name);
    if ("error" in made) {
      return res.code(409).send({ error: "You can have up to 10 active keys. Revoke one first.", code: "KEY_LIMIT" });
    }
    res.header("Cache-Control", "no-store");
    return res.code(201).send({
      key: made.key,
      // Shown once. Only a hash is stored, so it cannot be shown again.
      secret: made.secret,
    });
  });

  app.delete("/:id", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    const params = idSchema.safeParse(req.params);
    if (!params.success) return res.code(400).send({ error: "Invalid key id" });
    const ok = await apiKeysService.revoke(me.id, params.data.id);
    if (!ok) return res.code(404).send({ error: "Key not found" });
    return { ok: true };
  });
}

export default keysRoutes;
