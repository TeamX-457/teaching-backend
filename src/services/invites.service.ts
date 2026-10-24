import { db } from "@/config/db/db";
import { liveSessions, sessionInvites, user } from "@/models/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";

export type InviteResult =
  | { ok: true; invite: { id: string; identifier: string; name: string | null; email: string | null; pending: boolean } }
  | { ok: false; code: "NOT_FOUND" | "AMBIGUOUS" | "DUPLICATE" | "SELF"; message: string };

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const invitesService = {
  /** Invite by email (works even before that person has an account) or by exact display name. */
  async invite(sessionId: string, hostId: string, rawIdentifier: string): Promise<InviteResult> {
    const identifier = rawIdentifier.trim();
    let found: { id: string; name: string; email: string }[];

    if (looksLikeEmail(identifier)) {
      found = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(sql`lower(${user.email}) = ${identifier.toLowerCase()}`);
    } else {
      found = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(sql`lower(${user.name}) = ${identifier.toLowerCase()}`)
        .limit(3);
      if (found.length === 0) {
        return { ok: false, code: "NOT_FOUND", message: "No one with that name has an account. Invite them by email instead." };
      }
      if (found.length > 1) {
        return { ok: false, code: "AMBIGUOUS", message: "More than one person has that name. Invite them by email instead." };
      }
    }

    const match = found[0];
    if (match?.id === hostId) return { ok: false, code: "SELF", message: "You're already hosting this session." };

    const email = (match?.email ?? identifier).toLowerCase();
    const existing = await db
      .select({ id: sessionInvites.id })
      .from(sessionInvites)
      .where(and(eq(sessionInvites.sessionId, sessionId), eq(sessionInvites.invitedEmail, email)));
    if (existing.length) return { ok: false, code: "DUPLICATE", message: "They're already invited." };

    const [row] = await db
      .insert(sessionInvites)
      .values({ sessionId, identifier, invitedUserId: match?.id ?? null, invitedEmail: email })
      .returning();
    return { ok: true, invite: { id: row!.id, identifier, name: match?.name ?? null, email, pending: !match } };
  },

  async list(sessionId: string) {
    const rows = await db
      .select({
        id: sessionInvites.id,
        identifier: sessionInvites.identifier,
        email: sessionInvites.invitedEmail,
        userId: sessionInvites.invitedUserId,
        name: user.name,
        createdAt: sessionInvites.createdAt,
      })
      .from(sessionInvites)
      .leftJoin(user, eq(sessionInvites.invitedUserId, user.id))
      .where(eq(sessionInvites.sessionId, sessionId))
      .orderBy(desc(sessionInvites.createdAt));
    return rows.map((r) => ({ id: r.id, identifier: r.identifier, email: r.email, name: r.name, pending: !r.userId }));
  },

  async remove(sessionId: string, inviteId: string) {
    const rows = await db
      .delete(sessionInvites)
      .where(and(eq(sessionInvites.sessionId, sessionId), eq(sessionInvites.id, inviteId)))
      .returning({ id: sessionInvites.id });
    return rows.length > 0;
  },

  /** Live sessions the signed-in person has been invited to (by account or by email). */
  async forUser(userId: string, email: string) {
    return db
      .select({
        code: liveSessions.code,
        title: liveSessions.title,
        venueType: liveSessions.venueType,
        sourceLang: liveSessions.sourceLang,
        hostName: user.name,
        createdAt: liveSessions.createdAt,
      })
      .from(sessionInvites)
      .innerJoin(liveSessions, eq(sessionInvites.sessionId, liveSessions.id))
      .leftJoin(user, eq(liveSessions.hostId, user.id))
      .where(
        and(
          eq(liveSessions.status, "live"),
          or(eq(sessionInvites.invitedUserId, userId), eq(sessionInvites.invitedEmail, email.toLowerCase())),
        ),
      )
      .orderBy(desc(liveSessions.createdAt))
      .limit(20);
  },
};
