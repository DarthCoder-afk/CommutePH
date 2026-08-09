import "dotenv/config";

import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locationDuplicateReviews, locations } from "@/server/db/schema";

const statuses = [
  "pending",
  "distinct",
  "duplicate",
  "needs_field_check",
] as const;
type ReviewStatus = (typeof statuses)[number];

function parseOptions(arguments_: string[]) {
  const argumentsWithoutSeparator = arguments_.filter(
    (argument) => argument !== "--",
  );
  let status: ReviewStatus = "pending";
  let limit = 50;

  for (let index = 0; index < argumentsWithoutSeparator.length; index += 1) {
    const argument = argumentsWithoutSeparator[index];

    if (argument === "--status") {
      const value = argumentsWithoutSeparator[index + 1];

      if (!statuses.includes(value as ReviewStatus)) {
        throw new Error(`--status must be one of: ${statuses.join(", ")}.`);
      }

      status = value as ReviewStatus;
      index += 1;
      continue;
    }

    if (argument === "--limit") {
      const value = Number(argumentsWithoutSeparator[index + 1]);

      if (!Number.isInteger(value) || value < 1 || value > 500) {
        throw new Error("--limit must be an integer between 1 and 500.");
      }

      limit = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}.`);
  }

  return { status, limit };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const options = parseOptions(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const reviews = await db
      .select()
      .from(locationDuplicateReviews)
      .where(eq(locationDuplicateReviews.status, options.status))
      .orderBy(
        asc(locationDuplicateReviews.detectedDistanceMeters),
        asc(locationDuplicateReviews.createdAt),
      )
      .limit(options.limit);

    const locationIds = [
      ...new Set(
        reviews.flatMap((review) => [
          review.firstLocationId,
          review.secondLocationId,
        ]),
      ),
    ];
    const locationRows =
      locationIds.length === 0
        ? []
        : await db
            .select({
              id: locations.id,
              name: locations.name,
              slug: locations.slug,
              city: locations.city,
              sourceUrl: locations.sourceUrl,
            })
            .from(locations)
            .where(inArray(locations.id, locationIds));
    const locationById = new Map(
      locationRows.map((location) => [location.id, location]),
    );

    console.log(
      `Duplicate location reviews with status "${options.status}": ${reviews.length}`,
    );
    console.table(
      reviews.map((review) => {
        const first = locationById.get(review.firstLocationId);
        const second = locationById.get(review.secondLocationId);

        return {
          reviewId: review.id,
          first: first?.slug ?? review.firstLocationId,
          second: second?.slug ?? review.secondLocationId,
          names: `${first?.name ?? "Unknown"} / ${second?.name ?? "Unknown"}`,
          cities: `${first?.city ?? "Unknown"} / ${second?.city ?? "Unknown"}`,
          distanceMeters: review.detectedDistanceMeters,
          reason: review.detectionReason,
          notes: review.reviewerNotes ?? "",
          firstSource: first?.sourceUrl ?? "",
          secondSource: second?.sourceUrl ?? "",
        };
      }),
    );
    console.log("Read-only report complete. No database rows were modified.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
