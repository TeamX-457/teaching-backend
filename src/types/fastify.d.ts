import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { VerifiedKey } from "@/services/apikeys.service";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, res: FastifyReply) => Promise<void>;
    authorize: (
      role: string | string[],
    ) => (req: FastifyRequest, res: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** Set by requireApiKey on /v1 routes. */
    apiKey?: VerifiedKey;
  }
}
