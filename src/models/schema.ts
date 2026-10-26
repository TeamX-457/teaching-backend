import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  uuid,
  integer,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm/_relations";
export const venueTypeEnum = pgEnum("venue_type", [
  "classroom",
  "conference",
  "church",
  "town_hall",
  "other",
]);
export const liveSessionStatusEnum = pgEnum("live_session_status", [
  "live",
  "ended",
]);
export const userRoleEnum = pgEnum("user_role", ["educator", "student"]);
export const lessonStatusEnum = pgEnum("lesson_status", [
  "processing",
  "ready",
  "failed",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRoleEnum('role').default('student').notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId,
    ),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const lessons = pgTable("lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id),
  educatorId: text("educator_id").references(() => user.id),
  status: lessonStatusEnum("status").default("processing").notNull(),
  totalPages: integer("total_pages").default(0).notNull(),
  processedPages: integer("processed_pages").default(0).notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lessonPages = pgTable("lesson_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  lessonId: uuid("lesson_id")
    .references(() => lessons.id, { onDelete: "cascade" })
    .notNull(),
  pageNumber: integer("page_number").notNull(),
  englishText: text("english_text").notNull(),
  efikText: text("efik_text"),
  audioUrl: text("audio_url"),
  durationSecs: real("duration_secs"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---- Voice Verse: live captioning ------------------------------------------

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Short code listeners type in (or scan from a QR) to join without an account.
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    hostId: text("host_id")
      .references(() => user.id)
      .notNull(),
    venueType: venueTypeEnum("venue_type").default("classroom").notNull(),
    sourceLang: text("source_lang").default("en").notNull(),
    status: liveSessionStatusEnum("status").default("live").notNull(),
    listenerCount: integer("listener_count").default(0).notNull(),
    // What the host paid for: free | captions | standard | local (see src/config/pricing.ts)
    tier: text("tier").default("free").notNull(),
    // How many languages speak aloud at once. Each one uses the host's time at the same rate.
    voiceLanguages: integer("voice_languages").default(1).notNull(),
    // The host's chosen length. The session stops at this length.
    capSeconds: integer("cap_seconds"),
    // Time counted so far, and time not counted because the local voice was down (never charged).
    meteredSeconds: integer("metered_seconds").default(0).notNull(),
    pausedSeconds: integer("paused_seconds").default(0).notNull(),
    graceSeconds: integer("grace_seconds").default(0).notNull(),
    lastMeterAt: timestamp("last_meter_at"),
    // While in the future, the local voice is on its backup and time is not charged.
    fallbackUntil: timestamp("fallback_until"),
    // out_of_time | cap_reached, once paid features have stopped
    stoppedReason: text("stopped_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => [index("live_sessions_hostId_idx").on(table.hostId)],
);

export const captions = pgTable(
  "captions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .references(() => liveSessions.id, { onDelete: "cascade" })
      .notNull(),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("captions_session_seq_uidx").on(table.sessionId, table.seq),
  ],
);

// Editable word/phrase dictionary used by the translation service.
export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceLang: text("source_lang").default("en").notNull(),
    targetLang: text("target_lang").notNull(),
    sourceText: text("source_text").notNull(),
    targetText: text("target_text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("glossary_lang_source_uidx").on(
      table.sourceLang,
      table.targetLang,
      table.sourceText,
    ),
  ],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => liveSessions.id, {
    onDelete: "set null",
  }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionInvites = pgTable(
  "session_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").references(() => liveSessions.id, { onDelete: "cascade" }).notNull(),
    // What the host typed (an email or a name), kept for display.
    identifier: text("identifier").notNull(),
    invitedUserId: text("invited_user_id").references(() => user.id, { onDelete: "cascade" }),
    // Lower-cased; lets an invite reach someone who signs up with this email later.
    invitedEmail: text("invited_email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("session_invites_session_idx").on(table.sessionId), index("session_invites_email_idx").on(table.invitedEmail)],
);

// Keys for the public developer API (/v1). Only a SHA-256 hash is stored; the
// secret itself is shown once, when the key is created.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    // First characters of the secret. Safe to display so people can tell keys apart.
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [uniqueIndex("api_keys_hash_idx").on(table.keyHash), index("api_keys_user_idx").on(table.userId)],
);

// Every payment Voice Verse takes, one row per Paystack transaction. The Paystack account is shared with other
// products, so `reference` always starts with VOICEVERSE- (see src/services/paystack.naming.ts): that is what
// separates these payments from the others in the dashboard, in exports and in the profit report.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    planId: text("plan_id").notNull(),
    purpose: text("purpose").notNull(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").default("NGN").notNull(),
    // pending -> success | failed; success -> reversed (refunded)
    status: text("status").default("pending").notNull(),
    // false for test-mode keys, so test money never gets mixed into the books
    livemode: boolean("livemode").default(true).notNull(),
    channel: text("channel"),
    feesKobo: integer("fees_kobo"),
    gatewayResponse: text("gateway_response"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("payments_reference_idx").on(table.reference),
    index("payments_user_idx").on(table.userId),
    index("payments_status_idx").on(table.status),
  ],
);

// Time a host has bought, in seconds. One row per grant: a payment can create several (a bundle). It expires, and
// whatever is unused at expiry is gone for good (the terms say so). `reference` is the payment that created it,
// or FREE-YYYYMM for a speaker's free monthly time.
export const creditGrants = pgTable(
  "credit_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    reference: text("reference").notNull(),
    tier: text("tier").notNull(),
    secondsTotal: integer("seconds_total").notNull(),
    secondsUsed: integer("seconds_used").default(0).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("credit_grants_ref_tier_idx").on(table.reference, table.tier),
    index("credit_grants_user_idx").on(table.userId),
  ],
);

// A listener pass (paid) and the free local-voice trial (used up once, never renewed).
export const listenerPasses = pgTable(
  "listener_passes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    reference: text("reference").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("listener_passes_ref_idx").on(table.reference), index("listener_passes_user_idx").on(table.userId)],
);

export const listenerTrials = pgTable("listener_trials", {
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).primaryKey(),
  secondsUsed: integer("seconds_used").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  topic: text("topic").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof user.$inferSelect
export type Subject = typeof subjects.$inferSelect
export type Lesson = typeof lessons.$inferSelect
export type Session = typeof session.$inferSelect
export type LiveSession = typeof liveSessions.$inferSelect
export type Caption = typeof captions.$inferSelect
