CREATE TABLE "nabit"."assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"source_url" text NOT NULL,
	"storage_path" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "nabit"."item_assets" (
	"item_id" bigint NOT NULL,
	"asset_id" bigint NOT NULL,
	CONSTRAINT "item_assets_item_id_asset_id_pk" PRIMARY KEY("item_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "nabit"."item_assets" ADD CONSTRAINT "item_assets_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "nabit"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nabit"."item_assets" ADD CONSTRAINT "item_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "nabit"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assets_sha256" ON "nabit"."assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "idx_item_assets_asset_id" ON "nabit"."item_assets" USING btree ("asset_id");