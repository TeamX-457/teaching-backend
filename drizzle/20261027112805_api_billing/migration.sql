CREATE TABLE "api_accounts" (
	"user_id" text PRIMARY KEY,
	"credit_kobo" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_credit_topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reference" text NOT NULL,
	"user_id" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"key_id" uuid,
	"kind" text NOT NULL,
	"voice_class" text NOT NULL,
	"units" integer NOT NULL,
	"amount_kobo" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "monthly_cap_kobo" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "api_credit_topups_ref_idx" ON "api_credit_topups" ("reference");--> statement-breakpoint
CREATE INDEX "api_usage_user_idx" ON "api_usage" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_key_idx" ON "api_usage" ("key_id","created_at");--> statement-breakpoint
ALTER TABLE "api_accounts" ADD CONSTRAINT "api_accounts_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_credit_topups" ADD CONSTRAINT "api_credit_topups_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_key_id_api_keys_id_fkey" FOREIGN KEY ("key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL;