CREATE TABLE "journey_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_segment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_steps_position_positive" CHECK ("journey_steps"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "transport_route_stops" ADD COLUMN "pickup_landmark" varchar(240);--> statement-breakpoint
ALTER TABLE "transport_route_stops" ADD COLUMN "dropoff_landmark" varchar(240);--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_journey_segment_id_journey_segments_id_fk" FOREIGN KEY ("journey_segment_id") REFERENCES "public"."journey_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_steps_segment_position_uidx" ON "journey_steps" USING btree ("journey_segment_id","position");