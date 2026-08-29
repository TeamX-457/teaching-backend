import fp from "fastify-plugin";
import { auth } from "@/lib/auth";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorate(
    "authenticate",
    async (req: FastifyRequest, res: FastifyReply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session) {
        return res.status(401).send({
          error: "Unauthorized",
        });
      }
    },
  );

  fastify.decorate(
    "authorize",
    (role: string | string[]) =>
      async (req: FastifyRequest, res: FastifyReply) => {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });

        if (!session) {
          return res.status(401).send({
            error: "Unauthorized",
          });
        }

        const roles = Array.isArray(role) ? role : [role];
        if (!roles.includes(session.user.role as string)) {
          return res.status(403).send({
            error: "Forbidden",
          });
        }
      },
  );
});
