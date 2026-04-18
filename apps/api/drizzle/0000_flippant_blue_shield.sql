CREATE EXTENSION IF NOT EXISTS ltree;
--> statement-breakpoint
CREATE SCHEMA "nabit";
--> statement-breakpoint
CREATE TABLE "nabit"."comment_tags" (
	"comment_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "comment_tags_comment_id_tag_id_pk" PRIMARY KEY("comment_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" bigint NOT NULL,
	"external_id" text,
	"parent_external_id" text,
	"path" "ltree" NOT NULL,
	"author" text,
	"content_text" text NOT NULL,
	"source_created_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "uq_comments_item_external" UNIQUE("item_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."extractions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"item_id" bigint,
	"extractor" text NOT NULL,
	"extractor_version" text,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nabit"."item_tags" (
	"item_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"external_id" text,
	"author" text,
	"content_text" text,
	"title" text,
	"source_created_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "uq_items_source_external" UNIQUE("source_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."raw_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" bigint NOT NULL,
	"content_type" text NOT NULL,
	"body" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nabit"."tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "nabit"."users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "nabit"."comment_tags" ADD CONSTRAINT "comment_tags_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "nabit"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."comment_tags" ADD CONSTRAINT "comment_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "nabit"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."comments" ADD CONSTRAINT "comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."extractions" ADD CONSTRAINT "extractions_snapshot_id_raw_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "nabit"."raw_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."extractions" ADD CONSTRAINT "extractions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."item_tags" ADD CONSTRAINT "item_tags_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."item_tags" ADD CONSTRAINT "item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "nabit"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."raw_snapshots" ADD CONSTRAINT "raw_snapshots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_comments_item_id" ON "nabit"."comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_comments_path" ON "nabit"."comments" USING gist ("path");--> statement-breakpoint
CREATE INDEX "idx_extractions_snapshot_id" ON "nabit"."extractions" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_extractions_item_id" ON "nabit"."extractions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_items_source_type" ON "nabit"."items" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_items_ingested_at" ON "nabit"."items" USING btree ("ingested_at");--> statement-breakpoint
CREATE INDEX "idx_items_metadata" ON "nabit"."items" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "idx_raw_snapshots_item_id" ON "nabit"."raw_snapshots" USING btree ("item_id");
