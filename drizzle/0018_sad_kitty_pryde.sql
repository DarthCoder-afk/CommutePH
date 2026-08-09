CREATE TYPE "public"."journey_field_observation_outcome" AS ENUM('confirmed', 'not_found', 'needs_follow_up');--> statement-breakpoint
CREATE TABLE "journey_field_observation_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_field_observation_id" uuid NOT NULL,
	"journey_segment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "journey_segment_kind" NOT NULL,
	"observed_transport_route_id" uuid,
	"actual_duration_minutes" integer NOT NULL,
	"actual_fare_centavos" integer,
	"path_geometry" geometry(LineString, 4326),
	"notes" text,
	CONSTRAINT "journey_field_observation_segments_position_positive" CHECK ("journey_field_observation_segments"."position" >= 1),
	CONSTRAINT "journey_field_observation_segments_duration_positive" CHECK ("journey_field_observation_segments"."actual_duration_minutes" >= 1),
	CONSTRAINT "journey_field_observation_segments_shape_valid" CHECK (
        (
          "journey_field_observation_segments"."kind" = 'walking'
          AND "journey_field_observation_segments"."observed_transport_route_id" IS NULL
          AND "journey_field_observation_segments"."actual_fare_centavos" IS NULL
        )
        OR
        (
          "journey_field_observation_segments"."kind" = 'transit'
          AND "journey_field_observation_segments"."observed_transport_route_id" IS NOT NULL
          AND "journey_field_observation_segments"."actual_fare_centavos" IS NOT NULL
          AND "journey_field_observation_segments"."actual_fare_centavos" >= 0
        )
      ),
	CONSTRAINT "journey_field_observation_segments_path_valid" CHECK (
        "journey_field_observation_segments"."path_geometry" IS NULL
        OR
        (
          NOT ST_IsEmpty("journey_field_observation_segments"."path_geometry")
          AND ST_CoveredBy(
            "journey_field_observation_segments"."path_geometry",
            ST_MakeEnvelope(-180, -90, 180, 90, 4326)
          )
        )
      ),
	CONSTRAINT "journey_field_observation_segments_notes_valid" CHECK ("journey_field_observation_segments"."notes" IS NULL OR length(btrim("journey_field_observation_segments"."notes")) > 0)
);
--> statement-breakpoint
CREATE TABLE "journey_field_observation_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_field_observation_segment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL,
	CONSTRAINT "journey_field_observation_steps_position_positive" CHECK ("journey_field_observation_steps"."position" >= 1),
	CONSTRAINT "journey_field_observation_steps_instruction_valid" CHECK (length(btrim("journey_field_observation_steps"."instruction")) > 0)
);
--> statement-breakpoint
CREATE TABLE "journey_field_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"outcome" "journey_field_observation_outcome" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observer_label" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"actual_duration_minutes" integer,
	"actual_fare_centavos" integer,
	"actual_transfer_count" integer,
	"evidence_url" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_field_observations_observer_valid" CHECK (length(btrim("journey_field_observations"."observer_label")) >= 2),
	CONSTRAINT "journey_field_observations_notes_valid" CHECK (length(btrim("journey_field_observations"."notes")) >= 20),
	CONSTRAINT "journey_field_observations_time_valid" CHECK ("journey_field_observations"."observed_at" <= "journey_field_observations"."created_at"),
	CONSTRAINT "journey_field_observations_totals_valid" CHECK (
        (
          "journey_field_observations"."actual_duration_minutes" IS NULL
          AND "journey_field_observations"."actual_fare_centavos" IS NULL
          AND "journey_field_observations"."actual_transfer_count" IS NULL
        )
        OR
        (
          "journey_field_observations"."actual_duration_minutes" IS NOT NULL
          AND "journey_field_observations"."actual_duration_minutes" >= 1
          AND "journey_field_observations"."actual_fare_centavos" IS NOT NULL
          AND "journey_field_observations"."actual_fare_centavos" >= 0
          AND "journey_field_observations"."actual_transfer_count" IS NOT NULL
          AND "journey_field_observations"."actual_transfer_count" >= 0
        )
      ),
	CONSTRAINT "journey_field_observations_confirmed_totals_valid" CHECK (
        "journey_field_observations"."outcome" <> 'confirmed'
        OR
        (
          "journey_field_observations"."actual_duration_minutes" IS NOT NULL
          AND "journey_field_observations"."actual_fare_centavos" IS NOT NULL
          AND "journey_field_observations"."actual_transfer_count" IS NOT NULL
        )
      )
);
--> statement-breakpoint
ALTER TABLE "journey_field_observation_segments" ADD CONSTRAINT "journey_field_observation_segments_journey_field_observation_id_journey_field_observations_id_fk" FOREIGN KEY ("journey_field_observation_id") REFERENCES "public"."journey_field_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_field_observation_segments" ADD CONSTRAINT "journey_field_observation_segments_journey_segment_id_journey_segments_id_fk" FOREIGN KEY ("journey_segment_id") REFERENCES "public"."journey_segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_field_observation_segments" ADD CONSTRAINT "journey_field_observation_segments_observed_transport_route_id_transport_routes_id_fk" FOREIGN KEY ("observed_transport_route_id") REFERENCES "public"."transport_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_field_observation_steps" ADD CONSTRAINT "journey_field_observation_steps_journey_field_observation_segment_id_journey_field_observation_segments_id_fk" FOREIGN KEY ("journey_field_observation_segment_id") REFERENCES "public"."journey_field_observation_segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_field_observations" ADD CONSTRAINT "journey_field_observations_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_field_observation_segments_position_uidx" ON "journey_field_observation_segments" USING btree ("journey_field_observation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_field_observation_segments_segment_uidx" ON "journey_field_observation_segments" USING btree ("journey_field_observation_id","journey_segment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_field_observation_steps_position_uidx" ON "journey_field_observation_steps" USING btree ("journey_field_observation_segment_id","position");--> statement-breakpoint
CREATE INDEX "journey_field_observations_journey_observed_idx" ON "journey_field_observations" USING btree ("journey_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_field_observations_submission_uidx" ON "journey_field_observations" USING btree ("journey_id","observed_at","observer_label");--> statement-breakpoint
CREATE FUNCTION protect_journey_field_observation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  segment_count integer;
  maximum_position integer;
  duration_total integer;
  fare_total integer;
  transit_count integer;
  stored_segment_count integer;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Journey field observations are immutable after insertion.';
  END IF;

  IF OLD."finalized_at" IS NOT NULL
    OR NEW."finalized_at" IS NULL
    OR (to_jsonb(NEW) - 'finalized_at') <> (to_jsonb(OLD) - 'finalized_at')
  THEN
    RAISE EXCEPTION 'Journey field observations are immutable after insertion.';
  END IF;

  SELECT
    count(*)::integer,
    max(segment."position"),
    coalesce(sum(segment."actual_duration_minutes"), 0)::integer,
    coalesce(sum(segment."actual_fare_centavos"), 0)::integer,
    count(*) FILTER (WHERE segment."kind" = 'transit')::integer
  INTO segment_count, maximum_position, duration_total, fare_total, transit_count
  FROM "journey_field_observation_segments" segment
  WHERE segment."journey_field_observation_id" = NEW."id";

  IF segment_count > 0 THEN
    IF maximum_position <> segment_count THEN
      RAISE EXCEPTION 'Journey field observation segment positions must be gapless.';
    END IF;

    IF NEW."actual_duration_minutes" <> duration_total
      OR NEW."actual_fare_centavos" <> fare_total
      OR NEW."actual_transfer_count" <> greatest(transit_count - 1, 0)
    THEN
      RAISE EXCEPTION 'Journey field observation totals do not match its segments.';
    END IF;
  ELSIF NEW."actual_duration_minutes" IS NOT NULL
    OR NEW."actual_fare_centavos" IS NOT NULL
    OR NEW."actual_transfer_count" IS NOT NULL
  THEN
    RAISE EXCEPTION 'Journey field observation without segments cannot have totals.';
  END IF;

  IF NEW."outcome" = 'confirmed' THEN
    SELECT count(*)::integer
    INTO stored_segment_count
    FROM "journey_segments"
    WHERE "journey_id" = NEW."journey_id";

    IF segment_count = 0 OR segment_count <> stored_segment_count THEN
      RAISE EXCEPTION 'Confirmed journey evidence must include every stored segment.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "journey_field_observation_segments" segment
      WHERE segment."journey_field_observation_id" = NEW."id"
        AND (
          segment."path_geometry" IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "journey_field_observation_steps" step
            WHERE step."journey_field_observation_segment_id" = segment."id"
          )
        )
    )
    THEN
      RAISE EXCEPTION 'Confirmed journey segments require paths and instructions.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER journey_field_observations_immutable
BEFORE UPDATE OR DELETE ON "journey_field_observations"
FOR EACH ROW
EXECUTE FUNCTION protect_journey_field_observation();--> statement-breakpoint
CREATE FUNCTION protect_journey_field_observation_segment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND EXISTS (
      SELECT 1
      FROM "journey_field_observations" observation
      INNER JOIN "journey_segments" segment
        ON segment."id" = NEW."journey_segment_id"
      WHERE observation."id" = NEW."journey_field_observation_id"
        AND observation."finalized_at" IS NULL
        AND segment."journey_id" = observation."journey_id"
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Journey field observation segments are immutable after finalization.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER journey_field_observation_segments_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "journey_field_observation_segments"
FOR EACH ROW
EXECUTE FUNCTION protect_journey_field_observation_segment();--> statement-breakpoint
CREATE FUNCTION protect_journey_field_observation_step()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND EXISTS (
      SELECT 1
      FROM "journey_field_observation_segments" segment
      INNER JOIN "journey_field_observations" observation
        ON observation."id" = segment."journey_field_observation_id"
      WHERE segment."id" = NEW."journey_field_observation_segment_id"
        AND observation."finalized_at" IS NULL
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Journey field observation steps are immutable after finalization.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER journey_field_observation_steps_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "journey_field_observation_steps"
FOR EACH ROW
EXECUTE FUNCTION protect_journey_field_observation_step();
