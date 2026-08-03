ALTER TABLE "journey_segments" ADD COLUMN "public_notes" text;--> statement-breakpoint
ALTER TABLE "journey_segments" ADD CONSTRAINT "journey_segments_public_notes_not_blank" CHECK (
        "journey_segments"."public_notes" IS NULL
        OR length(btrim("journey_segments"."public_notes")) > 0
      );