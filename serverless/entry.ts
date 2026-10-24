// Vercel entry point (bundled to api/index.js at build time by `bun build`):
// runs the same Fastify app as `bun run index.ts`,
// but handled per-request instead of listening on a port.
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app";

let ready: ReturnType<typeof buildApp> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= buildApp({ logger: false }).then(async (app) => {
    await app.ready();
    return app;
  });
  const app = await ready;
  app.server.emit("request", req, res);
}
