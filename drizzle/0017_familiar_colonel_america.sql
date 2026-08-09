CREATE TYPE "public"."route_verification_decision" AS ENUM('approved', 'rejected', 'needs_follow_up');--> statement-breakpoint
CREATE TYPE "public"."route_verification_status" AS ENUM('unverified', 'verified', 'outdated');--> statement-breakpoint
CREATE TABLE "route_verification_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_field_observation_id" uuid NOT NULL,
	"decision" "route_verification_decision" NOT NULL,
	"reviewer_label" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_verification_decisions_reviewer_valid" CHECK (length(btrim("route_verification_decisions"."reviewer_label")) >= 2),
	CONSTRAINT "route_verification_decisions_notes_valid" CHECK (length(btrim("route_verification_decisions"."notes")) >= 20)
);
--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN "verification_status" "route_verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_verification_decisions" ADD CONSTRAINT "route_verification_decisions_route_field_observation_id_route_field_observations_id_fk" FOREIGN KEY ("route_field_observation_id") REFERENCES "public"."route_field_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "route_verification_decisions_observation_uidx" ON "route_verification_decisions" USING btree ("route_field_observation_id");--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_verified_requires_date" CHECK ("transport_routes"."verification_status" <> 'verified' OR "transport_routes"."last_verified_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_active_requires_verification" CHECK (
        NOT "transport_routes"."is_active"
        OR
        (
          "transport_routes"."verification_status" = 'verified'
          AND "transport_routes"."last_verified_at" IS NOT NULL
        )
      );--> statement-breakpoint
CREATE FUNCTION prevent_route_verification_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Route verification decisions are immutable; review a new observation instead.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER route_verification_decisions_immutable
BEFORE UPDATE OR DELETE ON "route_verification_decisions"
FOR EACH ROW
EXECUTE FUNCTION prevent_route_verification_decision_mutation();--> statement-breakpoint
CREATE FUNCTION require_route_activation_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_active"
    AND NOT EXISTS (
      SELECT 1
      FROM "route_verification_decisions" decision
      INNER JOIN "route_field_observations" observation
        ON observation."id" = decision."route_field_observation_id"
      WHERE observation."transport_route_id" = NEW."id"
        AND observation."observed_at" = NEW."last_verified_at"
        AND decision."decision" = 'approved'
    )
  THEN
    RAISE EXCEPTION 'Transport routes require an approved field observation before activation.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER transport_routes_require_activation_approval
BEFORE INSERT OR UPDATE ON "transport_routes"
FOR EACH ROW
EXECUTE FUNCTION require_route_activation_approval();--> statement-breakpoint
CREATE FUNCTION require_schedule_route_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."is_active"
    AND NOT EXISTS (
      SELECT 1
      FROM "transport_routes" route
      WHERE route."id" = NEW."transport_route_id"
        AND route."is_active"
        AND route."verification_status" = 'verified'
        AND route."last_verified_at" = NEW."last_verified_at"
    )
  THEN
    RAISE EXCEPTION 'Active schedules require an active verified route with the same verification date.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER transport_route_schedules_require_active_route
BEFORE INSERT OR UPDATE ON "transport_route_schedules"
FOR EACH ROW
EXECUTE FUNCTION require_schedule_route_activation();
