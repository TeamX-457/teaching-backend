import { lessonsController } from "@/controllers/lessons.controller";
import type { FastifyInstance } from "fastify";
async function lessonRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: app.authenticate,
    },
    lessonsController.getLessons,
  );

  app.post(
    "/new",
    {
      preHandler: [app.authenticate, app.authorize("educator")],
    },
    lessonsController.createLesson,
  );

  app.get(
    ":/id",
    {
      preHandler: [app.authenticate],
    },
    lessonsController.getLesson,
  );
}

export default lessonRoutes;
