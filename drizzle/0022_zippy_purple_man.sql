CREATE TABLE "transport_route_candidate_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transport_route_candidate_id" uuid NOT NULL,
	"transport_route_id" uuid NOT NULL,
	"promoted_by" varchar(120) NOT NULL,
	"notes" text NOT NULL,
	"evidence_url" text,
	"promoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_route_candidate_promotions_reviewer_valid" CHECK (length(btrim("transport_route_candidate_promotions"."promoted_by")) >= 2),
	CONSTRAINT "transport_route_candidate_promotions_notes_valid" CHECK (length(btrim("transport_route_candidate_promotions"."notes")) >= 20),
	CONSTRAINT "transport_route_candidate_promotions_evidence_url_valid" CHECK ("transport_route_candidate_promotions"."evidence_url" IS NULL OR "transport_route_candidate_promotions"."evidence_url" ~ '^https?://')
);
--> statement-breakpoint
ALTER TABLE "transport_route_candidate_promotions" ADD CONSTRAINT "transport_route_candidate_promotions_transport_route_candidate_id_transport_route_candidates_id_fk" FOREIGN KEY ("transport_route_candidate_id") REFERENCES "public"."transport_route_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_route_candidate_promotions" ADD CONSTRAINT "transport_route_candidate_promotions_transport_route_id_transport_routes_id_fk" FOREIGN KEY ("transport_route_id") REFERENCES "public"."transport_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_candidate_promotions_candidate_uidx" ON "transport_route_candidate_promotions" USING btree ("transport_route_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_candidate_promotions_route_uidx" ON "transport_route_candidate_promotions" USING btree ("transport_route_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_transport_route_candidate_promotion_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'transport route candidate promotion records are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER transport_route_candidate_promotions_immutable
BEFORE UPDATE OR DELETE ON "transport_route_candidate_promotions"
FOR EACH ROW
EXECUTE FUNCTION prevent_transport_route_candidate_promotion_changes();
