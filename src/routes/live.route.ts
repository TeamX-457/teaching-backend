import { liveController } from "@/controllers/live.controller";
import type { FastifyInstance } from "fastify";

// Prefix: /api/live
async function liveRoutes(app: FastifyInstance) {
  const educator = [app.authenticate, app.authorize("educator")];

  // Host (educator) endpoints
  app.post("/sessions", { preHandler: educator }, liveController.createSession);
  app.get("/sessions/mine", { preHandler: educator }, liveController.mySessions);
  app.post(
    "/sessions/:code/captions",
    { preHandler: educator },
    liveController.addCaption,
  );
  app.post(
    "/sessions/:code/end",
    { preHandler: educator },
    liveController.endSession,
  );
  app.post("/glossary", { preHandler: educator }, liveController.upsertGlossary);
  app.get("/stats", { preHandler: educator }, liveController.stats);
  app.post("/sessions/:code/invites", { preHandler: educator }, liveController.inviteToSession);
  app.get("/sessions/:code/invites", { preHandler: educator }, liveController.listInvites);
  app.delete("/sessions/:code/invites/:inviteId", { preHandler: educator }, liveController.removeInvite);
  // Any signed-in person: sessions they were invited to
  app.get("/invited", { preHandler: app.authenticate }, liveController.myInvites);

  // Public listener endpoints: no account needed, the join code is the access
  app.get("/sessions/:code", liveController.getSession);
  app.post("/sessions/:code/join", liveController.joinSession);
  app.get("/sessions/:code/captions", liveController.getCaptions);
  app.get("/glossary", liveController.getGlossary);
  app.post("/feedback", liveController.addFeedback);
}

export default liveRoutes;
