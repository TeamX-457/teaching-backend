import { subjectService } from "@/services/subject.service";
import { FastifyReply, FastifyRequest } from "fastify";

export const subjectController = {
  async createSubject(
    req: FastifyRequest<{ Body: { name: string; userId: string } }>,
    res: FastifyReply,
  ) {
    try {
      const { name, userId } = req.body;

      const result = subjectService.createSubject(name, userId);
      return res.code(201).send(result);
    } catch (error: unknown) {
      console.error(error);
    }
  },

  async getAllSubjects(req: FastifyRequest, res: FastifyReply) {
    try {
      const subjects = subjectService.getSubjects();
      return res.code(200).send(subjects);
    } catch (error) {
      console.error(error);
    }
  },

  async searchSubject(
    req: FastifyRequest<{ Querystring: { name: string } }>,
    res: FastifyReply,
  ) {
    try {
      const { name } = req.query;
      const subject = subjectService.searchSubject(name);
      return res.code(200).send(subject);
    } catch (err) {
      console.error(err);
      res.code(400).send({ error: "Failed to search subjects" });
    }
  },
};
