CREATE TYPE "public"."location_verification_decision" AS ENUM('approved', 'rejected', 'needs_follow_up');--> statement-breakpoint
CREATE TABLE "location_verification_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"decision" "location_verification_decision" NOT NULL,
	"reviewer_label" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_verification_decisions_reviewer_valid" CHECK (length(btrim("location_verification_decisions"."reviewer_label")) >= 2),
	CONSTRAINT "location_verification_decisions_notes_valid" CHECK (length(btrim("location_verification_decisions"."notes")) >= 20)
);
--> statement-breakpoint
ALTER TABLE "location_verification_decisions" ADD CONSTRAINT "location_verification_decisions_observation_id_location_field_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."location_field_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "location_verification_decisions_observation_uidx" ON "location_verification_decisions" USING btree ("observation_id");--> statement-breakpoint
CREATE FUNCTION prevent_location_verification_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Location verification decisions are immutable; review a new observation instead.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER location_verification_decisions_immutable
BEFORE UPDATE OR DELETE ON "location_verification_decisions"
FOR EACH ROW
EXECUTE FUNCTION prevent_location_verification_decision_mutation();--> statement-breakpoint
CREATE FUNCTION require_imported_location_activation_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_active"
    AND NEW."source_type" IN ('openstreetmap', 'gtfs')
    AND NOT EXISTS (
      SELECT 1
      FROM "location_verification_decisions" decision
      INNER JOIN "location_field_observations" observation
        ON observation."id" = decision."observation_id"
      WHERE observation."location_id" = NEW."id"
        AND observation."observed_at" = NEW."last_verified_at"
        AND decision."decision" = 'approved'
    )
  THEN
    RAISE EXCEPTION 'Imported locations require an approved field observation before activation.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER locations_require_activation_approval
BEFORE INSERT OR UPDATE ON "locations"
FOR EACH ROW
EXECUTE FUNCTION require_imported_location_activation_approval();
