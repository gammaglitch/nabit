CREATE TABLE "nabit"."ingest_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"url" text NOT NULL,
	"ingestor" text,
	"payload" jsonb,
	"item_id" bigint,
	"result" jsonb,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ingest_jobs_status_run_after" ON "nabit"."ingest_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "idx_ingest_jobs_created_at" ON "nabit"."ingest_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ingest_jobs_item_id" ON "nabit"."ingest_jobs" USING btree ("item_id");