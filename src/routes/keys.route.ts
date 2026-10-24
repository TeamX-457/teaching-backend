import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiKeysService } from "@/services/apikeys.service";

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });
const idSchema = z.object({ id: z.string().uuid() });

const currentUser = async (req: FastifyRequest) =>
  (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user;

// Prefix: /api/keys. Signed-in people manage their own keys here.
async function keysRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (req, res) => {
    const me = await currentUser(req);
    if (!me) return res.code(401).send({ error: "Unauthorized" });
    return { keys: await apiKeysService.list(me.id) };
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
