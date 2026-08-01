CREATE TYPE "public"."location_kind" AS ENUM(
  'area',
  'landmark',
  'station',
  'terminal',
  'stop',
  'entrance'
);
--> statement-breakpoint

CREATE TABLE "locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "slug" varchar(180) NOT NULL,
  "kind" "location_kind" NOT NULL,
  "description" text,
  "city" varchar(80) NOT NULL,
  "area" varchar(100),
  "coordinates" geometry(point, 4326) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "locations_coordinates_valid" CHECK (
    ST_X("coordinates") BETWEEN -180 AND 180
    AND ST_Y("coordinates") BETWEEN -90 AND 90
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX "locations_slug_uidx"
  ON "locations" USING btree ("slug");
--> statement-breakpoint

CREATE INDEX "locations_coordinates_gix"
  ON "locations" USING gist ("coordinates");