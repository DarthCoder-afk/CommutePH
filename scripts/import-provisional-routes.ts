import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locations,
  transportRouteCandidates,
  transportRouteCandidateStops,
} from "@/server/db/schema";
import type { ProvisionalOsmRouteCandidate } from "@/server/routes/osm-route-candidate-source";

type RouteCandidateImport = {
  sourceType: "openstreetmap" | "gtfs";
  sourceUrl: string;
  city: string;
  candidates: ProvisionalOsmRouteCandidate[];
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseInput(value: unknown): RouteCandidateImport {
  if (!value || typeof value !== "object") {
    throw new Error("The import file must contain a JSON object.");
  }

  const input = value as Partial<RouteCandidateImport>;

  if (
    (input.sourceType !== "openstreetmap" && input.sourceType !== "gtfs") ||
    !input.sourceUrl ||
    !isHttpUrl(input.sourceUrl) ||
    !input.city?.trim() ||
    !Array.isArray(input.candidates) ||
    input.candidates.length === 0
  ) {
    throw new Error("The route candidate import metadata is invalid.");
  }

  const externalIds = new Set<string>();

  for (const [index, candidate] of input.candidates.entries()) {
    if (
      !candidate.externalId?.trim() ||
      externalIds.has(candidate.externalId) ||
      !candidate.name?.trim() ||
      !candidate.rawMode?.trim() ||
      !candidate.sourceUrl ||
      !isHttpUrl(candidate.sourceUrl) ||
      !candidate.rawTags ||
      typeof candidate.rawTags !== "object" ||
      !Array.isArray(candidate.stops)
    ) {
      throw new Error(`Route candidate ${index + 1} is invalid.`);
    }

    externalIds.add(candidate.externalId);

    for (const [stopIndex, stop] of candidate.stops.entries()) {
      if (!stop.sourceExternalId?.trim() || stop.position !== stopIndex + 1) {
        throw new Error(
          `Route candidate ${index + 1} has an invalid stop sequence.`,
        );
      }
    }
  }

  return input as RouteCandidateImport;
}

async function main() {
  const inputPath = process.argv.slice(2).find((argument) => argument !== "--");

  if (!inputPath) {
    throw new Error(
      "Usage: pnpm db:import-provisional-routes -- <route-candidates.json>",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = parseInput(
    JSON.parse(await readFile(resolve(inputPath), "utf8")),
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const sourceLocations = await db
      .select({
        id: locations.id,
        sourceExternalId: locations.sourceExternalId,
      })
      .from(locations)
      .where(eq(locations.sourceType, input.sourceType));
    const locationIdByExternalId = new Map(
      sourceLocations.flatMap((location) =>
        location.sourceExternalId
          ? [[location.sourceExternalId, location.id] as const]
          : [],
      ),
    );

    const result = await db.transaction(async (transaction) => {
      let inserted = 0;
      let updated = 0;
      let preserved = 0;
      let linkedStops = 0;
      let unresolvedStops = 0;

      for (const candidate of input.candidates) {
        const [existing] = await transaction
          .select({
            id: transportRouteCandidates.id,
            status: transportRouteCandidates.status,
          })
          .from(transportRouteCandidates)
          .where(
            and(
              eq(transportRouteCandidates.sourceType, input.sourceType),
              eq(
                transportRouteCandidates.sourceExternalId,
                candidate.externalId,
              ),
            ),
          )
          .limit(1);

        if (existing && existing.status !== "pending") {
          preserved += 1;
          continue;
        }

        const values = {
          sourceType: input.sourceType,
          sourceExternalId: candidate.externalId.trim(),
          sourceUrl: candidate.sourceUrl,
          city: input.city.trim(),
          name: candidate.name.trim(),
          rawMode: candidate.rawMode.trim(),
          operator: candidate.operator?.trim() || null,
          reference: candidate.reference?.trim() || null,
          originName: candidate.originName?.trim() || null,
          destinationName: candidate.destinationName?.trim() || null,
          via: candidate.via?.trim() || null,
          rawTags: candidate.rawTags,
          status: "pending" as const,
          updatedAt: new Date(),
        };
        let candidateId: string;

        if (existing) {
          await transaction
            .update(transportRouteCandidates)
            .set(values)
            .where(eq(transportRouteCandidates.id, existing.id));
          await transaction
            .delete(transportRouteCandidateStops)
            .where(
              eq(
                transportRouteCandidateStops.transportRouteCandidateId,
                existing.id,
              ),
            );
          candidateId = existing.id;
          updated += 1;
        } else {
          const [created] = await transaction
            .insert(transportRouteCandidates)
            .values(values)
            .returning({ id: transportRouteCandidates.id });

          if (!created) {
            throw new Error("A route candidate could not be created.");
          }

          candidateId = created.id;
          inserted += 1;
        }

        if (candidate.stops.length > 0) {
          await transaction.insert(transportRouteCandidateStops).values(
            candidate.stops.map((stop) => {
              const locationId =
                locationIdByExternalId.get(stop.sourceExternalId) ?? null;

              if (locationId) linkedStops += 1;
              else unresolvedStops += 1;

              return {
                transportRouteCandidateId: candidateId,
                sourceExternalId: stop.sourceExternalId,
                rawRole: stop.rawRole?.trim() || null,
                mappedName: stop.mappedName?.trim() || null,
                locationId,
                position: stop.position,
              };
            }),
          );
        }
      }

      return {
        inserted,
        updated,
        preserved,
        linkedStops,
        unresolvedStops,
      };
    });

    console.table(result);
    console.log(
      "Import complete. Route candidates remain pending and cannot appear as public guidance.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
