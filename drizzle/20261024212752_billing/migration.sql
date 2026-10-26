CREATE TABLE "credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"reference" text NOT NULL,
	"tier" text NOT NULL,
	"seconds_total" integer NOT NULL,
	"seconds_used" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listener_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"reference" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listener_trials" (
	"user_id" text PRIMARY KEY,
	"seconds_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "voice_languages" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "cap_seconds" integer;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "metered_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "paused_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "grace_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "last_meter_at" timestamp;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "fallback_until" timestamp;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "stopped_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_grants_ref_tier_idx" ON "credit_grants" ("reference","tier");--> statement-breakpoint
CREATE INDEX "credit_grants_user_idx" ON "credit_grants" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listener_passes_ref_idx" ON "listener_passes" ("reference");--> statement-breakpoint
CREATE INDEX "listener_passes_user_idx" ON "listener_passes" ("user_id");--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listener_passes" ADD CONSTRAINT "listener_passes_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "listener_trials" ADD CONSTRAINT "listener_trials_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;