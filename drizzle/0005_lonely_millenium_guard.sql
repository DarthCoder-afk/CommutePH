CREATE TYPE "public"."journey_segment_kind" AS ENUM('walking', 'transit');--> statement-breakpoint
CREATE TABLE "journey_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "journey_segment_kind" NOT NULL,
	"summary" text NOT NULL,
	"walking_from_location_id" uuid,
	"walking_to_location_id" uuid,
	"boarding_route_stop_id" uuid,
	"alighting_route_stop_id" uuid,
	"estimated_duration_min" integer,
	"estimated_duration_max" integer,
	"estimated_fare_min_centavos" integer,
	"estimated_fare_max_centavos" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_segments_position_positive" CHECK ("journey_segments"."position" >= 1),
	CONSTRAINT "journey_segments_duration_range_valid" CHECK (
        (
          "journey_segments"."estimated_duration_min" IS NULL
          AND "journey_segments"."estimated_duration_max" IS NULL
        )
        OR
        (
          "journey_segments"."estimated_duration_min" IS NOT NULL
          AND "journey_segments"."estimated_duration_max" IS NOT NULL
          AND "journey_segments"."estimated_duration_min" >= 1
          AND "journey_segments"."estimated_duration_max"
            >= "journey_segments"."estimated_duration_min"
        )
      ),
	CONSTRAINT "journey_segments_fare_range_valid" CHECK (
        (
          "journey_segments"."estimated_fare_min_centavos" IS NULL
          AND "journey_segments"."estimated_fare_max_centavos" IS NULL
        )
        OR
        (
          "journey_segments"."estimated_fare_min_centavos" IS NOT NULL
          AND "journey_segments"."estimated_fare_max_centavos" IS NOT NULL
          AND "journey_segments"."estimated_fare_min_centavos" >= 0
          AND "journey_segments"."estimated_fare_max_centavos"
            >= "journey_segments"."estimated_fare_min_centavos"
        )
      ),
	CONSTRAINT "journey_segments_shape_valid" CHECK (
        (
          "journey_segments"."kind" = 'walking'
          AND "journey_segments"."walking_from_location_id" IS NOT NULL
          AND "journey_segments"."walking_to_location_id" IS NOT NULL
          AND "journey_segments"."walking_from_location_id"
            <> "journey_segments"."walking_to_location_id"
          AND "journey_segments"."boarding_route_stop_id" IS NULL
          AND "journey_segments"."alighting_route_stop_id" IS NULL
        )
        OR
        (
          "journey_segments"."kind" = 'transit'
          AND "journey_segments"."walking_from_location_id" IS NULL
          AND "journey_segments"."walking_to_location_id" IS NULL
          AND "journey_segments"."boarding_route_stop_id" IS NOT NULL
          AND "journey_segments"."alighting_route_stop_id" IS NOT NULL
          AND "journey_segments"."boarding_route_stop_id"
            <> "journey_segments"."alighting_route_stop_id"
        )
      )
);
--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_walking_from_location_id_locations_id_fk" FOREIGN KEY ("walking_from_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_walking_to_location_id_locations_id_fk" FOREIGN KEY ("walking_to_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_boarding_route_stop_id_transport_route_stops_id_fk" FOREIGN KEY ("boarding_route_stop_id") REFERENCES "public"."transport_route_stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_alighting_route_stop_id_transport_route_stops_id_fk" FOREIGN KEY ("alighting_route_stop_id") REFERENCES "public"."transport_route_stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_segments_journey_position_uidx" ON "journey_segments" USING btree ("journey_id","position");--> statement-breakpoint
CREATE INDEX "journey_segments_boarding_route_stop_idx" ON "journey_segments" USING btree ("boarding_route_stop_id");--> statement-breakpoint
CREATE INDEX "journey_segments_alighting_route_stop_idx" ON "journey_segments" USING btree ("alighting_route_stop_id");