ALTER TABLE "route_field_observations" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION protect_route_field_observation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD."finalized_at" IS NULL
    AND NEW."finalized_at" IS NOT NULL
    AND (to_jsonb(NEW) - 'finalized_at') = (to_jsonb(OLD) - 'finalized_at')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Route field observations are immutable after insertion.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER route_field_observations_immutable
BEFORE UPDATE OR DELETE ON "route_field_observations"
FOR EACH ROW
EXECUTE FUNCTION protect_route_field_observation();--> statement-breakpoint
CREATE FUNCTION protect_route_field_observation_stop()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND EXISTS (
      SELECT 1
      FROM "route_field_observations" observation
      WHERE observation."id" = NEW."route_field_observation_id"
        AND observation."finalized_at" IS NULL
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Route field observation stops are immutable after finalization.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER route_field_observation_stops_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "route_field_observation_stops"
FOR EACH ROW
EXECUTE FUNCTION protect_route_field_observation_stop();
