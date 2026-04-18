ALTER TABLE "nabit"."items" ADD COLUMN "subject_item_id" bigint;--> statement-breakpoint
ALTER TABLE "nabit"."items" ADD COLUMN "content_markdown" text;--> statement-breakpoint
ALTER TABLE "nabit"."items" ADD CONSTRAINT "fk_items_subject_item_id" FOREIGN KEY ("subject_item_id") REFERENCES "nabit"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_items_subject_item_id" ON "nabit"."items" USING btree ("subject_item_id");