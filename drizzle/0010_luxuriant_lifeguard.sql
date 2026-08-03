ALTER TABLE "journey_segments" ADD COLUMN "path_geometry" geometry(LineString, 4326);--> statement-breakpoint
ALTER TABLE "journey_segments" ADD COLUMN "path_last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_path_verification_pair" CHECK (
        (
          "journey_segments"."path_geometry" IS NULL
          AND "journey_segments"."path_last_verified_at" IS NULL
        )
        OR
        (
          "journey_segments"."path_geometry" IS NOT NULL
          AND "journey_segments"."path_last_verified_at" IS NOT NULL
        )
      );--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_path_not_empty" CHECK (
        "journey_segments"."path_geometry" IS NULL
        OR NOT ST_IsEmpty("journey_segments"."path_geometry")
      );--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_path_world_bounds" CHECK (
        "journey_segments"."path_geometry" IS NULL
        OR ST_CoveredBy(
          "journey_segments"."path_geometry",
          ST_MakeEnvelope(-180, -90, 180, 90, 4326)
        )
      );