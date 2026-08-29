// routes/subject.route.ts
import { subjectController } from "@/controllers/subject.controller";
import { FastifyInstance } from "fastify";

async function subjectRoutes(app: FastifyInstance) {
  app.get("/", subjectController.getAllSubjects);
  app.post("/new", subjectController.createSubject);
  app.get("/search", subjectController.searchSubject);
}

export default subjectRoutes;
