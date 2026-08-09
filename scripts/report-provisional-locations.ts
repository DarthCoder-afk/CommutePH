import "dotenv/config";

import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locations } from "@/server/db/schema";
import { assessLocationReadiness } from "@/server/locations/assess-location-readiness";
import { findLikelyLocationDuplicates } from "@/server/locations/find-likely-location-duplicates";

type ReportOptions = {
  city: string | null;
  limit: number;
};

function parseOptions(arguments_: string[]): ReportOptions {
  const options: ReportOptions = { city: null, limit: 50 };
  const argumentsWithoutSeparator = arguments_.filter(
    (argument) => argument !== "--",
  );

  for (let index = 0; index < argumentsWithoutSeparator.length; index += 1) {
    const argument = argumentsWithoutSeparator[index];

    if (argument === "--city") {
      const city = argumentsWithoutSeparator[index + 1]?.trim();

      if (!city) {
        throw new Error("--city requires a city name.");
      }

      options.city = city;
      index += 1;
      continue;
    }

    if (argument === "--limit") {
      const value = Number(argumentsWithoutSeparator[index + 1]);

      if (!Number.isInteger(value) || value < 1 || value > 500) {
        throw new Error("--limit must be an integer between 1 and 500.");
      }

      options.limit = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}.`);
  }

  return options;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const options = parseOptions(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        kind: locations.kind,
        city: locations.city,
        area: locations.area,
        coordinates: locations.coordinates,
        verificationStatus: locations.verificationStatus,
        lastVerifiedAt: locations.lastVerifiedAt,
        sourceType: locations.sourceType,
        sourceExternalId: locations.sourceExternalId,
        sourceUrl: locations.sourceUrl,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(
        and(
          eq(locations.verificationStatus, "unverified"),
          eq(locations.isActive, false),
        ),
      )
      .orderBy(asc(locations.city), asc(locations.name), asc(locations.slug));

    const matchingRows = options.city
      ? rows.filter(
          (row) =>
            row.city.toLocaleLowerCase() === options.city?.toLocaleLowerCase(),
        )
      : rows;
    const cityCounts = new Map<string, number>();

    for (const row of matchingRows) {
      cityCounts.set(row.city, (cityCounts.get(row.city) ?? 0) + 1);
    }

    console.log("Provisional location coverage");
    console.table(
      [...cityCounts.entries()].map(([city, count]) => ({ city, count })),
    );

    const reportRows = matchingRows.slice(0, options.limit).map((row) => {
      const readiness = assessLocationReadiness({
        ...row,
        longitude: row.coordinates.x,
        latitude: row.coordinates.y,
      });

      return {
        name: row.name,
        slug: row.slug,
        kind: row.kind,
        city: row.city,
        area: row.area ?? "",
        longitude: row.coordinates.x,
        latitude: row.coordinates.y,
        source: `${row.sourceType}:${row.sourceExternalId ?? "none"}`,
        blockers: readiness.blockers.length,
        sourceUrl: row.sourceUrl ?? "",
      };
    });

    console.log(
      `Showing ${reportRows.length} of ${matchingRows.length} matching provisional locations.`,
    );
    console.table(reportRows);

    const duplicateCandidates = matchingRows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      longitude: row.coordinates.x,
      latitude: row.coordinates.y,
    }));
    const duplicates = findLikelyLocationDuplicates(duplicateCandidates);

    console.log(`Likely duplicate pairs: ${duplicates.length}`);

    if (duplicates.length > 0) {
      console.table(
        duplicates.slice(0, options.limit).map((duplicate) => ({
          first: duplicate.first.slug,
          second: duplicate.second.slug,
          distanceMeters: Math.round(duplicate.distanceMeters),
          reason: duplicate.reason,
        })),
      );
    }

    console.log("Read-only report complete. No database rows were modified.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
