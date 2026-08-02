CREATE TYPE "public"."journey_status" AS ENUM('draft', 'verified', 'outdated');--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(180) NOT NULL,
	"summary" text NOT NULL,
	"origin_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"estimated_duration_min" integer,
	"estimated_duration_max" integer,
	"estimated_fare_min_centavos" integer,
	"estimated_fare_max_centavos" integer,
	"status" "journey_status" DEFAULT 'draft' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journeys_distinct_endpoints" CHECK ("journeys"."origin_location_id" <> "journeys"."destination_location_id"),
	CONSTRAINT "journeys_duration_range_valid" CHECK (
        (
          "journeys"."estimated_duration_min" IS NULL
          AND "journeys"."estimated_duration_max" IS NULL
        )
        OR
        (
          "journeys"."estimated_duration_min" IS NOT NULL
          AND "journeys"."estimated_duration_max" IS NOT NULL
          AND "journeys"."estimated_duration_min" >= 1
          AND "journeys"."estimated_duration_max"
            >= "journeys"."estimated_duration_min"
        )
      ),
	CONSTRAINT "journeys_fare_range_valid" CHECK (
        (
          "journeys"."estimated_fare_min_centavos" IS NULL
          AND "journeys"."estimated_fare_max_centavos" IS NULL
        )
        OR
        (
          "journeys"."estimated_fare_min_centavos" IS NOT NULL
          AND "journeys"."estimated_fare_max_centavos" IS NOT NULL
          AND "journeys"."estimated_fare_min_centavos" >= 0
          AND "journeys"."estimated_fare_max_centavos"
            >= "journeys"."estimated_fare_min_centavos"
        )
      ),
	CONSTRAINT "journeys_verified_requires_date" CHECK (
        "journeys"."status" <> 'verified'
        OR "journeys"."last_verified_at" IS NOT NULL
      ),
	CONSTRAINT "journeys_active_requires_complete_verification" CHECK (
        NOT "journeys"."is_active"
        OR
        (
          "journeys"."status" = 'verified'
          AND "journeys"."last_verified_at" IS NOT NULL
          AND "journeys"."estimated_duration_min" IS NOT NULL
          AND "journeys"."estimated_duration_max" IS NOT NULL
          AND "journeys"."estimated_fare_min_centavos" IS NOT NULL
          AND "journeys"."estimated_fare_max_centavos" IS NOT NULL
        )
      )
);
--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_origin_location_id_locations_id_fk" FOREIGN KEY ("origin_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journeys_slug_uidx" ON "journeys" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "journeys_origin_destination_idx" ON "journeys" USING btree ("origin_location_id","destination_location_id");