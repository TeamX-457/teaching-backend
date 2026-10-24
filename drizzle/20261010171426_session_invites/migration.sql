CREATE TABLE "session_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"invited_user_id" text,
	"invited_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "session_invites_session_idx" ON "session_invites" ("session_id");--> statement-breakpoint
CREATE INDEX "session_invites_email_idx" ON "session_invites" ("invited_email");--> statement-breakpoint
ALTER TABLE "session_invites" ADD CONSTRAINT "session_invites_session_id_live_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_invites" ADD CONSTRAINT "session_invites_invited_user_id_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "user"("id") ON DELETE CASCADE;