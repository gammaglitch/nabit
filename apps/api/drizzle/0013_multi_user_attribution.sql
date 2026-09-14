CREATE TABLE "nabit"."item_submissions" (
	"item_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"first_submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_submissions_item_id_user_id_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "nabit"."user_identities" (
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" bigint NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_subject_pk" PRIMARY KEY("provider","subject")
);
--> statement-breakpoint
ALTER TABLE "nabit"."users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "nabit"."users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nabit"."users" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nabit"."crawls" ADD COLUMN "created_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD COLUMN "submitted_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "nabit"."users" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "nabit"."users" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "nabit"."item_submissions" ADD CONSTRAINT "item_submissions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."item_submissions" ADD CONSTRAINT "item_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nabit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "nabit"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_submissions_user_id" ON "nabit"."item_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_identities_user_id" ON "nabit"."user_identities" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "nabit"."crawls" ADD CONSTRAINT "crawls_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "nabit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "nabit"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "nabit"."users" USING btree ("email");