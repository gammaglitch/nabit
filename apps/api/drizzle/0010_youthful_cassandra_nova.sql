DROP INDEX "nabit"."idx_digests_status";--> statement-breakpoint
ALTER TABLE "nabit"."digests" ADD COLUMN "run_after" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_digests_status_run_after" ON "nabit"."digests" USING btree ("status","run_after");