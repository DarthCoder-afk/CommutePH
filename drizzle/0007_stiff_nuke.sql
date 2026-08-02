CREATE TYPE "public"."journey_source_type" AS ENUM('official_web', 'operator_social', 'field_check');--> statement-breakpoint
CREATE TABLE "journey_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"source_type" "journey_source_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"publisher" varchar(160) NOT NULL,
	"url" varchar(500),
	"checked_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_sources_title_not_blank" CHECK (length(btrim("journey_sources"."title")) > 0),
	CONSTRAINT "journey_sources_publisher_not_blank" CHECK (length(btrim("journey_sources"."publisher")) > 0),
	CONSTRAINT "journey_sources_web_requires_url" CHECK (
        "journey_sources"."source_type" = 'field_check'
        OR "journey_sources"."url" IS NOT NULL
      )
);
--> statement-breakpoint
ALTER TABLE "journey_sources" ADD CONSTRAINT "journey_sources_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_sources_journey_url_uidx" ON "journey_sources" USING btree ("journey_id","url");--> statement-breakpoint
CREATE INDEX "journey_sources_journey_checked_at_idx" ON "journey_sources" USING btree ("journey_id","checked_at");