CREATE TABLE "nabit"."article_summaries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary_text" text,
	"model" text,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"source_sha256" text,
	"input_chars" integer,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_article_summaries_item" UNIQUE("item_id"),
	CONSTRAINT "article_summaries_status_check" CHECK ("nabit"."article_summaries"."status" in ('pending', 'success', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "nabit"."digests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"omitted_count" integer DEFAULT 0 NOT NULL,
	"summary_markdown" text,
	"model" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "uq_digests_period_start" UNIQUE("period_start"),
	CONSTRAINT "digests_status_check" CHECK ("nabit"."digests"."status" in ('pending', 'processing', 'success', 'failed', 'empty'))
);
--> statement-breakpoint
ALTER TABLE "nabit"."article_summaries" ADD CONSTRAINT "article_summaries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_article_summaries_status" ON "nabit"."article_summaries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_digests_status" ON "nabit"."digests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_digests_period_start" ON "nabit"."digests" USING btree ("period_start");