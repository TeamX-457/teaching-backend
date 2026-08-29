// routes/subject.route.ts
import { subjectController } from "@/controllers/subject.controller";
import { FastifyInstance } from "fastify";

async function subjectRoutes(app: FastifyInstance) {
  app.get("/", subjectController.getAllSubjects);
  app.post<{
    Body: {
      name: string;
      userId: string;
    };
  }>(
    "/new",
    {
      preHandler: [app.authenticate, app.authorize("educator")],
    },
    subjectController.createSubject,
  );
  app.get("/search", subjectController.searchSubject);
}

export default subjectRoutes;
