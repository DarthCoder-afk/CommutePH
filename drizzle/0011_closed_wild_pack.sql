CREATE TYPE "public"."location_source_type" AS ENUM('manual', 'openstreetmap', 'gtfs', 'development_fixture');--> statement-breakpoint
CREATE TYPE "public"."location_verification_status" AS ENUM('unverified', 'verified', 'outdated');--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "verification_status" "location_verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "source_type" "location_source_type" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "source_external_id" varchar(200);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "source_url" text;--> statement-breakpoint
-- Preserve the public status of locations that were explicitly active before
-- verification metadata existed. No verification timestamp is fabricated.
UPDATE "locations"
SET "verification_status" = 'verified', "source_type" = 'manual'
WHERE "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_source_external_id_uidx" ON "locations" USING btree ("source_type","source_external_id") WHERE "locations"."source_external_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_active_requires_verified" CHECK (NOT "locations"."is_active" OR "locations"."verification_status" = 'verified');--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_external_source_has_id" CHECK (
        "locations"."source_type" NOT IN ('openstreetmap', 'gtfs')
        OR "locations"."source_external_id" IS NOT NULL
      );
