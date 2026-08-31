import { db } from "@/config/db/db";
import { subjects, user } from "@/models/schema";
import { eq } from "drizzle-orm";

export const subjectService = {
  async createSubject(name: string, userId: string) {
    const [currentUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId));

    if (!currentUser) {
      throw new Error("User not found");
    }

    if (currentUser.role !== "educator") {
      throw new Error("Only educators can create subjects");
    }

    const slug = `/${name}`;
    const [newSubject] = await db
      .insert(subjects)
      .values({
        name: name,
        slug: slug,
      })
      .returning();

    return newSubject;
  },

  async getSubjects(page: number = 1, limit: number = 10) {
    const offset = (page - 1) * 10;

    const allSubjects = await db
      .select()
      .from(subjects)
      .limit(limit)
      .offset(offset);

    if (!allSubjects.length) {
      return {
        success: false,
        message: "No subjects exist. Create one",
        data: null,
      };
    }

    return { success: true, data: allSubjects };
  },

  async searchSubject(name: string) {
    const subject = await db
      .select()
      .from(subjects)
      .where(eq(subjects.name, name));

    return subject;
  },
};
