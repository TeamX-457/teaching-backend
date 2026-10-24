CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reference" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"plan_id" text NOT NULL,
	"purpose" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"livemode" boolean DEFAULT true NOT NULL,
	"channel" text,
	"fees_kobo" integer,
	"gateway_response" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_idx" ON "payments" ("reference");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" ("user_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" ("status");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;