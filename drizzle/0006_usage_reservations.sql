CREATE TABLE "usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"visitor_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"cost_micro_usd" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_reservations_expires_at_idx" ON "usage_reservations" USING btree ("expires_at");