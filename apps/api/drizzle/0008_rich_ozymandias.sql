ALTER TABLE "nabit"."ingest_jobs" ADD COLUMN "digest_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nabit"."items" ADD COLUMN "digest_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_items_digest_window" ON "nabit"."items" USING btree ("ingested_at") WHERE "nabit"."items"."digest_opt_in";