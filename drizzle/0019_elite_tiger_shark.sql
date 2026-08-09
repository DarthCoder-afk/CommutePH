CREATE TYPE "public"."journey_verification_decision" AS ENUM('approved', 'rejected', 'needs_follow_up');--> statement-breakpoint
CREATE TABLE "journey_verification_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_field_observation_id" uuid NOT NULL,
	"decision" "journey_verification_decision" NOT NULL,
	"reviewer_label" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_verification_decisions_reviewer_valid" CHECK (length(btrim("journey_verification_decisions"."reviewer_label")) >= 2),
	CONSTRAINT "journey_verification_decisions_notes_valid" CHECK (length(btrim("journey_verification_decisions"."notes")) >= 20)
);
--> statement-breakpoint
ALTER TABLE "journey_verification_decisions" ADD CONSTRAINT "journey_verification_decisions_journey_field_observation_id_journey_field_observations_id_fk" FOREIGN KEY ("journey_field_observation_id") REFERENCES "public"."journey_field_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_verification_decisions_observation_uidx" ON "journey_verification_decisions" USING btree ("journey_field_observation_id");--> statement-breakpoint
CREATE FUNCTION prevent_journey_verification_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Journey verification decisions are immutable; review a new field test instead.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER journey_verification_decisions_immutable
BEFORE UPDATE OR DELETE ON "journey_verification_decisions"
FOR EACH ROW
EXECUTE FUNCTION prevent_journey_verification_decision_mutation();--> statement-breakpoint
CREATE FUNCTION require_journey_activation_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_active"
    AND NOT EXISTS (
      SELECT 1
      FROM "journey_verification_decisions" decision
      INNER JOIN "journey_field_observations" observation
        ON observation."id" = decision."journey_field_observation_id"
      WHERE observation."journey_id" = NEW."id"
        AND observation."observed_at" = NEW."last_verified_at"
        AND decision."decision" = 'approved'
    )
  THEN
    RAISE EXCEPTION 'Journeys require an approved field test before activation.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER journeys_require_activation_approval
BEFORE INSERT OR UPDATE ON "journeys"
FOR EACH ROW
EXECUTE FUNCTION require_journey_activation_approval();
