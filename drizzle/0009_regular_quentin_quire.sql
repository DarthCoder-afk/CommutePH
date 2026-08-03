CREATE TABLE "transport_route_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transport_route_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"service_days" varchar(100) NOT NULL,
	"operating_hours" varchar(160) NOT NULL,
	"public_notes" text,
	"last_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_route_schedules_position_positive" CHECK ("transport_route_schedules"."position" >= 1),
	CONSTRAINT "transport_route_schedules_service_days_not_blank" CHECK (length(btrim("transport_route_schedules"."service_days")) > 0),
	CONSTRAINT "transport_route_schedules_operating_hours_not_blank" CHECK (length(btrim("transport_route_schedules"."operating_hours")) > 0),
	CONSTRAINT "transport_route_schedules_public_notes_not_blank" CHECK (
        "transport_route_schedules"."public_notes" IS NULL
        OR length(btrim("transport_route_schedules"."public_notes")) > 0
      ),
	CONSTRAINT "transport_route_schedules_active_requires_verification" CHECK (
        NOT "transport_route_schedules"."is_active"
        OR "transport_route_schedules"."last_verified_at" IS NOT NULL
      )
);
--> statement-breakpoint
ALTER TABLE "transport_route_schedules" ADD CONSTRAINT "transport_route_schedules_transport_route_id_transport_routes_id_fk" FOREIGN KEY ("transport_route_id") REFERENCES "public"."transport_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_schedules_route_position_uidx" ON "transport_route_schedules" USING btree ("transport_route_id","position");--> statement-breakpoint
CREATE INDEX "transport_route_schedules_route_active_idx" ON "transport_route_schedules" USING btree ("transport_route_id","is_active","position");