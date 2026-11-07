CREATE TABLE "studio_outputs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_outputs" ADD CONSTRAINT "studio_outputs_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_outputs_notebook_id_idx" ON "studio_outputs" USING btree ("notebook_id","id");--> statement-breakpoint
CREATE INDEX "studio_outputs_processing_idx" ON "studio_outputs" USING btree ("created_at") WHERE "studio_outputs"."status" = 'processing';