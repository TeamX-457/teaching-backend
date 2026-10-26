import { db } from "@/config/db/db";
import {
  captions,
  feedback,
  glossaryTerms,
  liveSessions,
  user,
} from "@/models/schema";
import { announce } from "@/services/caption-hub";
import { generateJoinCode } from "@/utils/join-code";
import type { Clock, ClockStore } from "@/services/billing.service";
import { and, asc, avg, count, desc, eq, gt, isNull, sql } from "drizzle-orm";

type VenueType = "classroom" | "conference" | "church" | "town_hall" | "other";

export const liveService = {
  async createSession(input: {
    title: string;
    hostId: string;
    venueType: VenueType;
    sourceLang: string;
    tier?: string;
    voiceLanguages?: number;
    capSeconds?: number | null;
  }) {
    // Retry on the (unlikely) join-code collision.
    for (let attempt = 0; ; attempt++) {
      try {
        const [row] = await db
          .insert(liveSessions)
          .values({ ...input, code: generateJoinCode() })
          .returning();
        return row;
      } catch (err) {
        if (attempt >= 4) throw err;
      }
    }
  },

  async getByCode(code: string) {
    const [row] = await db
      .select({
        id: liveSessions.id,
        code: liveSessions.code,
        title: liveSessions.title,
        venueType: liveSessions.venueType,
        sourceLang: liveSessions.sourceLang,
        status: liveSessions.status,
        hostId: liveSessions.hostId,
        hostName: user.name,
        createdAt: liveSessions.createdAt,
        tier: liveSessions.tier,
        voiceLanguages: liveSessions.voiceLanguages,
        capSeconds: liveSessions.capSeconds,
        meteredSeconds: liveSessions.meteredSeconds,
        pausedSeconds: liveSessions.pausedSeconds,
        graceSeconds: liveSessions.graceSeconds,
        lastMeterAt: liveSessions.lastMeterAt,
        fallbackUntil: liveSessions.fallbackUntil,
        stoppedReason: liveSessions.stoppedReason,
      })
      .from(liveSessions)
      .leftJoin(user, eq(liveSessions.hostId, user.id))
      .where(eq(liveSessions.code, code));
    return row;
  },

  /** Where the session clock keeps its state (see billing.service.ts). */
  clockStore(sessionId: string): ClockStore {
    return {
      async claim(prev, next) {
        const rows = await db
          .update(liveSessions)
          .set({ lastMeterAt: next })
          .where(and(eq(liveSessions.id, sessionId), prev ? eq(liveSessions.lastMeterAt, prev) : isNull(liveSessions.lastMeterAt)))
          .returning({ id: liveSessions.id });
        return rows.length > 0;
      },
      async save(patch: Partial<Clock>) {
        const { status: _s, tier: _t, voiceLanguages: _v, capSeconds: _c, lastMeterAt: _l, ...rest } = patch;
        if (Object.keys(rest).length) await db.update(liveSessions).set(rest).where(eq(liveSessions.id, sessionId));
      },
    };
  },

  async markFallback(sessionId: string, until: Date) {
    await db.update(liveSessions).set({ fallbackUntil: until }).where(eq(liveSessions.id, sessionId));
  },

  async listForHost(hostId: string) {
    return db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.hostId, hostId))
      .orderBy(desc(liveSessions.createdAt))
      .limit(50);
  },

  async registerListener(sessionId: string) {
    await db
      .update(liveSessions)
      .set({ listenerCount: sql`${liveSessions.listenerCount} + 1` })
      .where(eq(liveSessions.id, sessionId));
  },

  async endSession(code: string, hostId: string) {
    const [row] = await db
      .update(liveSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(liveSessions.code, code), eq(liveSessions.hostId, hostId)))
      .returning();
    if (row) announce(row.id); // listeners waiting for a caption find out straight away
    return row;
  },

  async addCaption(sessionId: string, text: string) {
    for (let attempt = 0; ; attempt++) {
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${captions.seq}), 0)` })
        .from(captions)
        .where(eq(captions.sessionId, sessionId));
      try {
        const [row] = await db
          .insert(captions)
          .values({ sessionId, text, seq: Number(max) + 1 })
          .returning();
        announce(sessionId);
        return row;
      } catch (err) {
        // unique (session, seq) collision from a concurrent post: retry
        if (attempt >= 2) throw err;
      }
    }
  },

  /** Newest caption number of a session, 0 when there are none. One cheap query. */
  async latestSeq(sessionId: string) {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${captions.seq}), 0)` })
      .from(captions)
      .where(eq(captions.sessionId, sessionId));
    return Number(max);
  },

  async getCaptions(sessionId: string, after = 0, limit = 100) {
    return db
      .select({
        id: captions.id,
        seq: captions.seq,
        text: captions.text,
        createdAt: captions.createdAt,
      })
      .from(captions)
      .where(and(eq(captions.sessionId, sessionId), gt(captions.seq, after)))
      .orderBy(asc(captions.seq))
      .limit(limit);
  },

  async getGlossary(sourceLang: string, targetLang: string) {
    return db
      .select({
        sourceText: glossaryTerms.sourceText,
        targetText: glossaryTerms.targetText,
      })
      .from(glossaryTerms)
      .where(
        and(
          eq(glossaryTerms.sourceLang, sourceLang),
          eq(glossaryTerms.targetLang, targetLang),
        ),
      );
  },

  async upsertGlossaryTerms(
    terms: {
      sourceLang: string;
      targetLang: string;
      sourceText: string;
      targetText: string;
    }[],
  ) {
    if (!terms.length) return [];
    return db
      .insert(glossaryTerms)
      .values(terms)
      .onConflictDoUpdate({
        target: [
          glossaryTerms.sourceLang,
          glossaryTerms.targetLang,
          glossaryTerms.sourceText,
        ],
        set: { targetText: sql`excluded.target_text` },
      })
      .returning();
  },

  async addFeedback(input: {
    sessionId?: string;
    rating: number;
    comment?: string;
  }) {
    const [row] = await db.insert(feedback).values(input).returning();
    return row;
  },

  // Pilot numbers for the SCOY report / judges.
  async getStats() {
    const [sessions] = await db
      .select({
        total: count(),
        listeners: sql<number>`coalesce(sum(${liveSessions.listenerCount}), 0)`,
      })
      .from(liveSessions);
    const [caps] = await db.select({ total: count() }).from(captions);
    const [fb] = await db
      .select({ total: count(), average: avg(feedback.rating) })
      .from(feedback);
    const byVenue = await db
      .select({ venueType: liveSessions.venueType, total: count() })
      .from(liveSessions)
      .groupBy(liveSessions.venueType);
    return {
      sessions: sessions.total,
      listeners: Number(sessions.listeners),
      captions: caps.total,
      feedbackCount: fb.total,
      averageRating: fb.average ? Number(Number(fb.average).toFixed(2)) : null,
      byVenue,
    };
  },
};
