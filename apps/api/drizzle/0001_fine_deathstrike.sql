ALTER TABLE "nabit"."items" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "idx_items_search_vector" ON "nabit"."items" USING gin ("search_vector");--> statement-breakpoint

UPDATE "nabit"."items"
SET "search_vector" = to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content_text", ''));--> statement-breakpoint

CREATE OR REPLACE FUNCTION nabit.items_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content_text, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER trg_items_search_vector
  BEFORE INSERT OR UPDATE OF title, content_text ON nabit.items
  FOR EACH ROW
  EXECUTE FUNCTION nabit.items_search_vector_update();