CREATE TABLE "journey_fixture_location_replacements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"fixture_location_id" uuid NOT NULL,
	"replacement_location_id" uuid NOT NULL,
	"confirmed_by" varchar(120) NOT NULL,
	"confirmation_notes" text NOT NULL,
	"evidence_url" text,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_fixture_replacements_locations_distinct" CHECK ("journey_fixture_location_replacements"."fixture_location_id" <> "journey_fixture_location_replacements"."replacement_location_id"),
	CONSTRAINT "journey_fixture_replacements_confirmer_valid" CHECK (length(btrim("journey_fixture_location_replacements"."confirmed_by")) >= 2),
	CONSTRAINT "journey_fixture_replacements_notes_valid" CHECK (length(btrim("journey_fixture_location_replacements"."confirmation_notes")) >= 20),
	CONSTRAINT "journey_fixture_replacements_evidence_url_valid" CHECK (
        "journey_fixture_location_replacements"."evidence_url" IS NULL
        OR "journey_fixture_location_replacements"."evidence_url" ~ '^https?://'
      )
);
--> statement-breakpoint
ALTER TABLE "journey_fixture_location_replacements" ADD CONSTRAINT "journey_fixture_location_replacements_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_fixture_location_replacements" ADD CONSTRAINT "journey_fixture_location_replacements_fixture_location_id_locations_id_fk" FOREIGN KEY ("fixture_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_fixture_location_replacements" ADD CONSTRAINT "journey_fixture_location_replacements_replacement_location_id_locations_id_fk" FOREIGN KEY ("replacement_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_fixture_replacements_journey_fixture_uidx" ON "journey_fixture_location_replacements" USING btree ("journey_id","fixture_location_id");--> statement-breakpoint
CREATE FUNCTION enforce_journey_fixture_replacement_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  journey_status journey_status;
  journey_is_active boolean;
  fixture_source location_source_type;
  fixture_is_active boolean;
  replacement_source location_source_type;
BEGIN
  SELECT status, is_active
  INTO journey_status, journey_is_active
  FROM journeys
  WHERE id = NEW.journey_id;

  SELECT source_type, is_active
  INTO fixture_source, fixture_is_active
  FROM locations
  WHERE id = NEW.fixture_location_id;

  SELECT source_type
  INTO replacement_source
  FROM locations
  WHERE id = NEW.replacement_location_id;

  IF journey_status <> 'draft' OR journey_is_active THEN
    RAISE EXCEPTION 'Fixture replacements require an inactive draft journey.';
  END IF;

  IF fixture_source <> 'development_fixture' OR fixture_is_active THEN
    RAISE EXCEPTION 'The old location must be an inactive development fixture.';
  END IF;

  IF replacement_source = 'development_fixture' THEN
    RAISE EXCEPTION 'The replacement cannot be a development fixture.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER journey_fixture_replacements_insert_guard
BEFORE INSERT ON journey_fixture_location_replacements
FOR EACH ROW
EXECUTE FUNCTION enforce_journey_fixture_replacement_insert();--> statement-breakpoint
CREATE FUNCTION prevent_journey_fixture_replacement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Journey fixture replacement decisions are immutable.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER journey_fixture_replacements_immutable
BEFORE UPDATE OR DELETE ON journey_fixture_location_replacements
FOR EACH ROW
EXECUTE FUNCTION prevent_journey_fixture_replacement_mutation();
