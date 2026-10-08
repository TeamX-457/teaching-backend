import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "public");

// Only these files are served: no directory traversal, no new dependency.
const FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/host": { file: "host.html", type: "text/html; charset=utf-8" },
  "/listen": { file: "listen.html", type: "text/html; charset=utf-8" },
  "/listening": { file: "listening.html", type: "text/html; charset=utf-8" },
  "/history": { file: "history.html", type: "text/html; charset=utf-8" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  "/listening.js": { file: "listening.js", type: "text/javascript; charset=utf-8" },
  "/common.js": { file: "common.js", type: "text/javascript; charset=utf-8" },
};

async function webRoutes(app: FastifyInstance) {
  for (const [url, { file, type }] of Object.entries(FILES)) {
    app.get(url, async (_req, res) => {
      const body = await readFile(join(PUBLIC_DIR, file));
      return res.type(type).send(body);
    });
  }
}

export default webRoutes;
