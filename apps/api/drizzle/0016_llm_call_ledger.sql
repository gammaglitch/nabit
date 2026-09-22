CREATE TABLE "nabit"."llm_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cost_usd" numeric(14, 8),
	"duration_ms" integer,
	"generation_id" text,
	"user_id" bigint,
	"item_id" bigint,
	"tag_run_id" bigint,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_status_check" CHECK ("nabit"."llm_calls"."status" in ('success', 'error'))
);
--> statement-breakpoint
ALTER TABLE "nabit"."llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nabit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."llm_calls" ADD CONSTRAINT "llm_calls_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."llm_calls" ADD CONSTRAINT "llm_calls_tag_run_id_tag_runs_id_fk" FOREIGN KEY ("tag_run_id") REFERENCES "nabit"."tag_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_llm_calls_created_at" ON "nabit"."llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_feature_created_at" ON "nabit"."llm_calls" USING btree ("feature","created_at");