import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";

const fastify = Fastify({
  logger: true,
});

fastify.get("/", (req: FastifyRequest, res: FastifyReply) => {
  res.send({ message: "Hello world" });
});

fastify.listen({ port: 3000 }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
