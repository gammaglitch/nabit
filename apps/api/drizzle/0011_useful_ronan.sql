CREATE TABLE "nabit"."crawl_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"crawl_id" bigint NOT NULL,
	"item_id" bigint,
	"url" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"parent_page_id" bigint,
	"discovery_index" integer DEFAULT 0 NOT NULL,
	"is_root" boolean DEFAULT false NOT NULL,
	"is_leaf" boolean DEFAULT false NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_crawl_pages_crawl_url" UNIQUE("crawl_id","url"),
	CONSTRAINT "crawl_pages_status_check" CHECK ("nabit"."crawl_pages"."status" in ('queued', 'running', 'done', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "nabit"."crawls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"root_url" text NOT NULL,
	"root_item_id" bigint,
	"label" text,
	"scope" text DEFAULT 'host' NOT NULL,
	"path_prefix" text,
	"follow_external" boolean DEFAULT false NOT NULL,
	"include_pattern" text,
	"exclude_pattern" text,
	"max_depth" integer DEFAULT 3 NOT NULL,
	"max_pages" integer DEFAULT 200 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"pages_done" integer DEFAULT 0 NOT NULL,
	"pages_failed" integer DEFAULT 0 NOT NULL,
	"pages_queued" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "crawls_scope_check" CHECK ("nabit"."crawls"."scope" in ('host', 'path')),
	CONSTRAINT "crawls_status_check" CHECK ("nabit"."crawls"."status" in ('queued', 'running', 'paused', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD COLUMN "crawl_id" bigint;--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD COLUMN "crawl_page_id" bigint;--> statement-breakpoint
ALTER TABLE "nabit"."crawl_pages" ADD CONSTRAINT "crawl_pages_crawl_id_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "nabit"."crawls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."crawl_pages" ADD CONSTRAINT "crawl_pages_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."crawl_pages" ADD CONSTRAINT "fk_crawl_pages_parent_page_id" FOREIGN KEY ("parent_page_id") REFERENCES "nabit"."crawl_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."crawls" ADD CONSTRAINT "crawls_root_item_id_items_id_fk" FOREIGN KEY ("root_item_id") REFERENCES "nabit"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_crawl_status" ON "nabit"."crawl_pages" USING btree ("crawl_id","status");--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_item_id" ON "nabit"."crawl_pages" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_crawl_pages_parent_page_id" ON "nabit"."crawl_pages" USING btree ("parent_page_id");--> statement-breakpoint
CREATE INDEX "idx_crawls_status" ON "nabit"."crawls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_crawls_created_at" ON "nabit"."crawls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_crawls_root_item_id" ON "nabit"."crawls" USING btree ("root_item_id");--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_crawl_id_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "nabit"."crawls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_crawl_page_id_crawl_pages_id_fk" FOREIGN KEY ("crawl_page_id") REFERENCES "nabit"."crawl_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ingest_jobs_crawl_id" ON "nabit"."ingest_jobs" USING btree ("crawl_id");