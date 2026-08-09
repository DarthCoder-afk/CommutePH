CREATE TYPE "public"."location_field_observation_outcome" AS ENUM('confirmed', 'not_found', 'needs_follow_up');--> statement-breakpoint
CREATE TABLE "location_field_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"outcome" "location_field_observation_outcome" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observer_label" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"observed_name" varchar(160),
	"observed_kind" "location_kind",
	"observed_coordinates" geometry(point, 4326),
	"accuracy_meters" integer,
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_field_observations_observer_valid" CHECK (length(btrim("location_field_observations"."observer_label")) >= 2),
	CONSTRAINT "location_field_observations_notes_valid" CHECK (length(btrim("location_field_observations"."notes")) >= 20),
	CONSTRAINT "location_field_observations_time_valid" CHECK ("location_field_observations"."observed_at" <= "location_field_observations"."created_at"),
	CONSTRAINT "location_field_observations_coordinates_valid" CHECK (
        "location_field_observations"."observed_coordinates" IS NULL
        OR
        (
          ST_X("location_field_observations"."observed_coordinates") BETWEEN -180 AND 180
          AND ST_Y("location_field_observations"."observed_coordinates") BETWEEN -90 AND 90
        )
      ),
	CONSTRAINT "location_field_observations_accuracy_valid" CHECK (
        (
          "location_field_observations"."observed_coordinates" IS NULL
          AND "location_field_observations"."accuracy_meters" IS NULL
        )
        OR
        (
          "location_field_observations"."observed_coordinates" IS NOT NULL
          AND "location_field_observations"."accuracy_meters" IS NOT NULL
          AND "location_field_observations"."accuracy_meters" BETWEEN 1 AND 10000
        )
      ),
	CONSTRAINT "location_field_observations_confirmed_details_valid" CHECK (
        "location_field_observations"."outcome" <> 'confirmed'
        OR
        (
          "location_field_observations"."observed_name" IS NOT NULL
          AND length(btrim("location_field_observations"."observed_name")) > 0
          AND "location_field_observations"."observed_kind" IS NOT NULL
          AND "location_field_observations"."observed_coordinates" IS NOT NULL
        )
      )
);
--> statement-breakpoint
ALTER TABLE "location_field_observations" ADD CONSTRAINT "location_field_observations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_field_observations_location_observed_idx" ON "location_field_observations" USING btree ("location_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "location_field_observations_submission_uidx" ON "location_field_observations" USING btree ("location_id","observed_at","observer_label");--> statement-breakpoint
CREATE FUNCTION prevent_location_field_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Location field observations are immutable; record a new observation instead.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER location_field_observations_immutable
BEFORE UPDATE OR DELETE ON "location_field_observations"
FOR EACH ROW
EXECUTE FUNCTION prevent_location_field_observation_mutation();
