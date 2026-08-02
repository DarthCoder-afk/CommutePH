CREATE TABLE "transport_route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transport_route_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"can_board" boolean DEFAULT true NOT NULL,
	"can_alight" boolean DEFAULT true NOT NULL,
	"pickup_instructions" text,
	"dropoff_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_route_stops_position_positive" CHECK ("transport_route_stops"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "transport_route_stops" ADD CONSTRAINT "transport_route_stops_transport_route_id_transport_routes_id_fk" FOREIGN KEY ("transport_route_id") REFERENCES "public"."transport_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_route_stops" ADD CONSTRAINT "transport_route_stops_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_stops_route_position_uidx" ON "transport_route_stops" USING btree ("transport_route_id","position");--> statement-breakpoint
CREATE INDEX "transport_route_stops_location_idx" ON "transport_route_stops" USING btree ("location_id");