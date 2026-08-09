CREATE TYPE "public"."route_field_observation_outcome" AS ENUM('confirmed', 'not_found', 'needs_follow_up');--> statement-breakpoint
CREATE TABLE "route_field_observation_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_field_observation_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"can_board" boolean NOT NULL,
	"can_alight" boolean NOT NULL,
	"notes" text,
	CONSTRAINT "route_field_observation_stops_position_positive" CHECK ("route_field_observation_stops"."position" >= 1),
	CONSTRAINT "route_field_observation_stops_access_valid" CHECK ("route_field_observation_stops"."can_board" OR "route_field_observation_stops"."can_alight"),
	CONSTRAINT "route_field_observation_stops_notes_valid" CHECK ("route_field_observation_stops"."notes" IS NULL OR length(btrim("route_field_observation_stops"."notes")) > 0)
);
--> statement-breakpoint
CREATE TABLE "route_field_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transport_route_id" uuid NOT NULL,
	"outcome" "route_field_observation_outcome" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observer_label" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"observed_name" varchar(180),
	"observed_mode" "transport_mode",
	"observed_operator" varchar(160),
	"observed_signboard" varchar(200),
	"service_days" varchar(100),
	"operating_hours" varchar(160),
	"fare_min_centavos" integer,
	"fare_max_centavos" integer,
	"payment_method" varchar(120),
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_field_observations_observer_valid" CHECK (length(btrim("route_field_observations"."observer_label")) >= 2),
	CONSTRAINT "route_field_observations_notes_valid" CHECK (length(btrim("route_field_observations"."notes")) >= 20),
	CONSTRAINT "route_field_observations_time_valid" CHECK ("route_field_observations"."observed_at" <= "route_field_observations"."created_at"),
	CONSTRAINT "route_field_observations_fare_valid" CHECK (
        (
          "route_field_observations"."fare_min_centavos" IS NULL
          AND "route_field_observations"."fare_max_centavos" IS NULL
        )
        OR
        (
          "route_field_observations"."fare_min_centavos" IS NOT NULL
          AND "route_field_observations"."fare_max_centavos" IS NOT NULL
          AND "route_field_observations"."fare_min_centavos" >= 0
          AND "route_field_observations"."fare_max_centavos" >= "route_field_observations"."fare_min_centavos"
        )
      ),
	CONSTRAINT "route_field_observations_confirmed_details_valid" CHECK (
        "route_field_observations"."outcome" <> 'confirmed'
        OR
        (
          "route_field_observations"."observed_name" IS NOT NULL
          AND length(btrim("route_field_observations"."observed_name")) > 0
          AND "route_field_observations"."observed_mode" IS NOT NULL
          AND "route_field_observations"."observed_signboard" IS NOT NULL
          AND length(btrim("route_field_observations"."observed_signboard")) > 0
          AND "route_field_observations"."service_days" IS NOT NULL
          AND length(btrim("route_field_observations"."service_days")) > 0
          AND "route_field_observations"."operating_hours" IS NOT NULL
          AND length(btrim("route_field_observations"."operating_hours")) > 0
          AND "route_field_observations"."fare_min_centavos" IS NOT NULL
          AND "route_field_observations"."fare_max_centavos" IS NOT NULL
          AND "route_field_observations"."payment_method" IS NOT NULL
          AND length(btrim("route_field_observations"."payment_method")) > 0
        )
      )
);
--> statement-breakpoint
ALTER TABLE "route_field_observation_stops" ADD CONSTRAINT "route_field_observation_stops_route_field_observation_id_route_field_observations_id_fk" FOREIGN KEY ("route_field_observation_id") REFERENCES "public"."route_field_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_field_observation_stops" ADD CONSTRAINT "route_field_observation_stops_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_field_observations" ADD CONSTRAINT "route_field_observations_transport_route_id_transport_routes_id_fk" FOREIGN KEY ("transport_route_id") REFERENCES "public"."transport_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "route_field_observation_stops_position_uidx" ON "route_field_observation_stops" USING btree ("route_field_observation_id","position");--> statement-breakpoint
CREATE INDEX "route_field_observations_route_observed_idx" ON "route_field_observations" USING btree ("transport_route_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "route_field_observations_submission_uidx" ON "route_field_observations" USING btree ("transport_route_id","observed_at","observer_label");