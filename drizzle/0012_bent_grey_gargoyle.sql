CREATE TYPE "public"."location_duplicate_detection_reason" AS ENUM('same_normalized_name', 'very_close_proximity');--> statement-breakpoint
CREATE TYPE "public"."location_duplicate_review_status" AS ENUM('pending', 'distinct', 'duplicate', 'needs_field_check');--> statement-breakpoint
CREATE TABLE "location_duplicate_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_location_id" uuid NOT NULL,
	"second_location_id" uuid NOT NULL,
	"status" "location_duplicate_review_status" DEFAULT 'pending' NOT NULL,
	"detection_reason" "location_duplicate_detection_reason" NOT NULL,
	"detected_distance_meters" integer NOT NULL,
	"reviewer_notes" text,
	"reviewed_at" timestamp with time zone,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_duplicate_reviews_canonical_pair" CHECK ("location_duplicate_reviews"."first_location_id"::text < "location_duplicate_reviews"."second_location_id"::text),
	CONSTRAINT "location_duplicate_reviews_distance_nonnegative" CHECK ("location_duplicate_reviews"."detected_distance_meters" >= 0),
	CONSTRAINT "location_duplicate_reviews_decision_metadata_valid" CHECK (
        (
          "location_duplicate_reviews"."status" = 'pending'
          AND "location_duplicate_reviews"."reviewer_notes" IS NULL
          AND "location_duplicate_reviews"."reviewed_at" IS NULL
        )
        OR
        (
          "location_duplicate_reviews"."status" <> 'pending'
          AND "location_duplicate_reviews"."reviewer_notes" IS NOT NULL
          AND length(btrim("location_duplicate_reviews"."reviewer_notes")) >= 10
          AND "location_duplicate_reviews"."reviewed_at" IS NOT NULL
        )
      )
);
--> statement-breakpoint
ALTER TABLE "location_duplicate_reviews" ADD CONSTRAINT "location_duplicate_reviews_first_location_id_locations_id_fk" FOREIGN KEY ("first_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_duplicate_reviews" ADD CONSTRAINT "location_duplicate_reviews_second_location_id_locations_id_fk" FOREIGN KEY ("second_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "location_duplicate_reviews_pair_uidx" ON "location_duplicate_reviews" USING btree ("first_location_id","second_location_id");--> statement-breakpoint
CREATE INDEX "location_duplicate_reviews_status_idx" ON "location_duplicate_reviews" USING btree ("status");