CREATE TABLE "nabit"."tag_run_matches" (
	"run_id" bigint NOT NULL,
	"item_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"confidence" real NOT NULL,
	CONSTRAINT "tag_run_matches_run_id_item_id_tag_id_pk" PRIMARY KEY("run_id","item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."tag_run_tags" (
	"run_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "tag_run_tags_run_id_tag_id_pk" PRIMARY KEY("run_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."tag_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"items_total" integer DEFAULT 0 NOT NULL,
	"items_scored" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"cursor_item_id" bigint,
	"model" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"created_by_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	CONSTRAINT "tag_runs_status_check" CHECK ("nabit"."tag_runs"."status" in ('pending', 'scoring', 'scored', 'applied', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "nabit"."tag_run_matches" ADD CONSTRAINT "tag_run_matches_run_id_tag_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "nabit"."tag_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."tag_run_matches" ADD CONSTRAINT "tag_run_matches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."tag_run_matches" ADD CONSTRAINT "tag_run_matches_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "nabit"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."tag_run_tags" ADD CONSTRAINT "tag_run_tags_run_id_tag_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "nabit"."tag_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."tag_run_tags" ADD CONSTRAINT "tag_run_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "nabit"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."tag_runs" ADD CONSTRAINT "tag_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "nabit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tag_run_matches_run_tag" ON "nabit"."tag_run_matches" USING btree ("run_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_tag_runs_status_run_after" ON "nabit"."tag_runs" USING btree ("status","run_after");