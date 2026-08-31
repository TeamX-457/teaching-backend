import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import authPlugin from "@/plugins/auth.plugin";

import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";
import subjectRoutes from "@/routes/subject.route";
import lessonRoutes from "@/routes/lesson.route";

const app = Fastify({
  logger: true,
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

app
  .listen({ port: 3000, host: "0.0.0.0" })
  .then(() => {
    console.log("Server running on http://localhost:3000");
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
