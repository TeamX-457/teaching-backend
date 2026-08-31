import { lessonService } from "@/services/lessons.service";
import { LessonStatus } from "@/types/lessons";
import { FastifyReply, FastifyRequest } from "fastify";

export const lessonsController = {
  async getLesson(
    req: FastifyRequest<{ Params: { id: string } }>,
    res: FastifyReply,
  ) {
    try {
      const { id } = req.params;
      const lessons = await lessonService.getLessons(id);
      return res.code(200).send({
        lessons,
      });
    } catch (error: unknown) {
      console.error(error);
    }
  },

  async createLesson(
    req: FastifyRequest<{
      Body: { title: string; subjectId: string; educatorId: string };
    }>,
    res: FastifyReply,
  ) {
    try {
      const { title, subjectId, educatorId } = req.body;
      const newLesson = await lessonService.createLesson(
        title,
        subjectId,
        educatorId,
      );
      return res.code(201).send({
        newLesson,
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(400).send({
        error: error,
        message: "Something went wrong",
      });
    }
  },

  async getLessons(
    req: FastifyRequest<{
      Body: {
        subjectId?: string;
        status?: LessonStatus;
        page: number;
        limit: number;
      };
    }>,
    res: FastifyReply,
  ) {
    try {
      const { subjectId, status, page, limit } = req.body;
      const lessons = await lessonService.getLessons(
        subjectId,
        page,
        limit,
        status,
      );
      return res.code(200).send({
        lessons,
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(500).send({
        error: error,
        message: "Something went wrong",
      });
    }
  },
};
