import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, res: FastifyReply) => Promise<void>;
    authorize: (
      role: string | string[],
    ) => (req: FastifyRequest, res: FastifyReply) => Promise<void>;
  }
}
