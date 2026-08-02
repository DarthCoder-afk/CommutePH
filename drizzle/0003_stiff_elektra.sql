CREATE TYPE "public"."transport_mode" AS ENUM('jeepney', 'modern_jeepney', 'city_bus', 'bgc_bus');--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"name" varchar(180) NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"operator" varchar(160),
	"signboard" varchar(200),
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_slug_uidx" ON "transport_routes" USING btree ("slug");