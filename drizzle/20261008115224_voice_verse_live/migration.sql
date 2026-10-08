CREATE TYPE "live_session_status" AS ENUM('live', 'ended');--> statement-breakpoint
CREATE TYPE "venue_type" AS ENUM('classroom', 'conference', 'church', 'town_hall', 'other');--> statement-breakpoint
CREATE TABLE "captions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_lang" text DEFAULT 'en' NOT NULL,
	"target_lang" text NOT NULL,
	"source_text" text NOT NULL,
	"target_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"host_id" text NOT NULL,
	"venue_type" "venue_type" DEFAULT 'classroom'::"venue_type" NOT NULL,
	"source_lang" text DEFAULT 'en' NOT NULL,
	"status" "live_session_status" DEFAULT 'live'::"live_session_status" NOT NULL,
	"listener_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "captions_session_seq_uidx" ON "captions" ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_lang_source_uidx" ON "glossary_terms" ("source_lang","target_lang","source_text");--> statement-breakpoint
CREATE INDEX "live_sessions_hostId_idx" ON "live_sessions" ("host_id");--> statement-breakpoint
ALTER TABLE "captions" ADD CONSTRAINT "captions_session_id_live_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_session_id_live_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_host_id_user_id_fkey" FOREIGN KEY ("host_id") REFERENCES "user"("id");