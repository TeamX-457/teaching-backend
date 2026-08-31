import { db } from "@/config/db/db";
import { lessons, subjects, user } from "@/models/schema";
import { LessonStatus } from "@/types/lessons";
import { eq, and, count, sql } from "drizzle-orm";

export const lessonService = {
  async createLesson(title: string, subjectId: string, educatorId: string) {
    const [newLesson] = await db
      .insert(lessons)
      .values({
        title: title,
        subjectId,
        educatorId,
        status: "processing",
      })
      .returning();

    return newLesson;
  },
  async getLesson(id: string) {
    const lesson = await db.select().from(lessons).where(eq(lessons.id, id));
    return lesson[0];
  },

  async getLessons(
    subjectId?: string,
    page: number = 1,
    limit: number = 10,
    status?: LessonStatus,
  ) {
    const offset = (page - 1) * 10;

    const conditions = [];
    if (subjectId) {
      conditions.push(eq(lessons.subjectId, subjectId));
    }
    if (status) {
      conditions.push(eq(lessons.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const allLessons = await db
      .select({
        id: lessons.id,
        title: lessons.title,
        subjectName: subjects.name,
        educatorName: user.name,
        status: lessons.status,
        totalPages: lessons.totalPages,
        createdAt: lessons.createdAt,
      })
      .from(lessons)
      .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
      .leftJoin(user, eq(lessons.educatorId, user.id))
      .where(whereClause)
      .orderBy(lessons.createdAt)
      .limit(limit)
      .offset(offset);

    if (allLessons.length < 0) {
      throw new Error("No lessons yet. Create one.");
    }

    const countResult = await db
      .select({
        count: sql`count(*
        )`,
      })
      .from(lessons)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    return {
      lessons: allLessons,
      pagination: {
        page,
        limit,
        total,
      },
    };
  },
};
