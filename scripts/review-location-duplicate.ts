import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locationDuplicateReviews } from "@/server/db/schema";
import { validateLocationDuplicateReviewDecision } from "@/server/locations/location-duplicate-review";

function parseArguments(arguments_: string[]) {
  const values = arguments_.filter((argument) => argument !== "--");
  const reviewId = values[0]?.trim();
  const status = values[1]?.trim();
  const notesFlagIndex = values.indexOf("--notes");
  const notes =
    notesFlagIndex === -1 ? "" : values.slice(notesFlagIndex + 1).join(" ");

  if (!reviewId || !status || notesFlagIndex === -1) {
    throw new Error(
      'Usage: pnpm db:review-location-duplicate -- <review-id> <distinct|duplicate|needs_field_check> --notes "Your evidence or next action"',
    );
  }

  return {
    reviewId,
    ...validateLocationDuplicateReviewDecision(status, notes),
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = parseArguments(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [existing] = await db
      .select({ id: locationDuplicateReviews.id })
      .from(locationDuplicateReviews)
      .where(eq(locationDuplicateReviews.id, input.reviewId))
      .limit(1);

    if (!existing) {
      throw new Error(`Duplicate review "${input.reviewId}" was not found.`);
    }

    const reviewedAt = new Date();
    const [updated] = await db
      .update(locationDuplicateReviews)
      .set({
        status: input.status,
        reviewerNotes: input.notes,
        reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(eq(locationDuplicateReviews.id, input.reviewId))
      .returning({
        id: locationDuplicateReviews.id,
        status: locationDuplicateReviews.status,
        reviewerNotes: locationDuplicateReviews.reviewerNotes,
        reviewedAt: locationDuplicateReviews.reviewedAt,
      });

    console.table([updated]);
    console.log(
      "Review decision saved. No locations were modified, activated, merged, or deleted.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
