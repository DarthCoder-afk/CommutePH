CREATE TYPE "public"."transport_route_candidate_source_type" AS ENUM('openstreetmap', 'gtfs');--> statement-breakpoint
CREATE TYPE "public"."transport_route_candidate_status" AS ENUM('pending', 'promoted', 'rejected');--> statement-breakpoint
CREATE TABLE "transport_route_candidate_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transport_route_candidate_id" uuid NOT NULL,
	"source_external_id" varchar(200) NOT NULL,
	"raw_role" varchar(80),
	"mapped_name" varchar(180),
	"location_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_route_candidate_stops_position_positive" CHECK ("transport_route_candidate_stops"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "transport_route_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "transport_route_candidate_source_type" NOT NULL,
	"source_external_id" varchar(200) NOT NULL,
	"source_url" text NOT NULL,
	"city" varchar(80) NOT NULL,
	"name" varchar(180) NOT NULL,
	"raw_mode" varchar(80) NOT NULL,
	"operator" varchar(160),
	"reference" varchar(120),
	"origin_name" varchar(180),
	"destination_name" varchar(180),
	"via" varchar(180),
	"raw_tags" jsonb NOT NULL,
	"status" "transport_route_candidate_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_route_candidates_name_not_blank" CHECK (length(btrim("transport_route_candidates"."name")) > 0),
	CONSTRAINT "transport_route_candidates_mode_not_blank" CHECK (length(btrim("transport_route_candidates"."raw_mode")) > 0),
	CONSTRAINT "transport_route_candidates_source_url_valid" CHECK ("transport_route_candidates"."source_url" ~ '^https?://')
);
--> statement-breakpoint
ALTER TABLE "transport_route_candidate_stops" ADD CONSTRAINT "transport_route_candidate_stops_transport_route_candidate_id_transport_route_candidates_id_fk" FOREIGN KEY ("transport_route_candidate_id") REFERENCES "public"."transport_route_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_route_candidate_stops" ADD CONSTRAINT "transport_route_candidate_stops_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_candidate_stops_position_uidx" ON "transport_route_candidate_stops" USING btree ("transport_route_candidate_id","position");--> statement-breakpoint
CREATE INDEX "transport_route_candidate_stops_location_idx" ON "transport_route_candidate_stops" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_candidates_source_uidx" ON "transport_route_candidates" USING btree ("source_type","source_external_id");--> statement-breakpoint
CREATE INDEX "transport_route_candidates_city_status_idx" ON "transport_route_candidates" USING btree ("city","status");