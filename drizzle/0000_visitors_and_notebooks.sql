CREATE TABLE "notebooks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_ip_hash" text
);
--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notebooks_visitor_id_idx" ON "notebooks" USING btree ("visitor_id","updated_at");