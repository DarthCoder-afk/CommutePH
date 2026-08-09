import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locations } from "@/server/db/schema";

type ImportSourceType = "openstreetmap" | "gtfs" | "development_fixture";

type ProvisionalStopInput = {
  externalId: string;
  name: string;
  slug: string;
  kind: "station" | "terminal" | "stop" | "entrance";
  description?: string | null;
  city: string;
  area?: string | null;
  sourceUrl?: string;
  longitude: number;
  latitude: number;
};

type ProvisionalStopImport = {
  sourceType: ImportSourceType;
  sourceUrl: string;
  stops: ProvisionalStopInput[];
};

const inputPath = process.argv.slice(2).find((argument) => argument !== "--");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedSourceTypes = new Set<ImportSourceType>([
  "openstreetmap",
  "gtfs",
  "development_fixture",
]);
const allowedKinds = new Set<ProvisionalStopInput["kind"]>([
  "station",
  "terminal",
  "stop",
  "entrance",
]);

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseImport(value: unknown): ProvisionalStopImport {
  if (!value || typeof value !== "object") {
    throw new Error("The import file must contain a JSON object.");
  }

  const input = value as Partial<ProvisionalStopImport>;

  if (!input.sourceType || !allowedSourceTypes.has(input.sourceType)) {
    throw new Error(
      "sourceType must be openstreetmap, gtfs, or development_fixture.",
    );
  }

  if (!input.sourceUrl || !isHttpUrl(input.sourceUrl)) {
    throw new Error("sourceUrl must be a valid HTTP URL.");
  }

  if (!Array.isArray(input.stops) || input.stops.length === 0) {
    throw new Error("stops must contain at least one provisional stop.");
  }

  const seenExternalIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const [index, stop] of input.stops.entries()) {
    if (!stop || typeof stop !== "object") {
      throw new Error(`Stop ${index + 1} must be an object.`);
    }

    if (!stop.externalId?.trim()) {
      throw new Error(`Stop ${index + 1} needs an externalId.`);
    }

    if (seenExternalIds.has(stop.externalId)) {
      throw new Error(`Duplicate externalId: ${stop.externalId}.`);
    }

    seenExternalIds.add(stop.externalId);

    if (!stop.name?.trim()) {
      throw new Error(`Stop ${index + 1} needs a name.`);
    }

    if (!stop.slug || !slugPattern.test(stop.slug)) {
      throw new Error(`Stop ${index + 1} needs a valid lowercase slug.`);
    }

    if (seenSlugs.has(stop.slug)) {
      throw new Error(`Duplicate slug: ${stop.slug}.`);
    }

    seenSlugs.add(stop.slug);

    if (!stop.kind || !allowedKinds.has(stop.kind)) {
      throw new Error(
        `Stop ${index + 1} kind must be station, terminal, stop, or entrance.`,
      );
    }

    if (!stop.city?.trim()) {
      throw new Error(`Stop ${index + 1} needs a city.`);
    }

    if (
      !Number.isFinite(stop.longitude) ||
      stop.longitude < -180 ||
      stop.longitude > 180 ||
      !Number.isFinite(stop.latitude) ||
      stop.latitude < -90 ||
      stop.latitude > 90
    ) {
      throw new Error(`Stop ${index + 1} has invalid coordinates.`);
    }

    if (stop.sourceUrl && !isHttpUrl(stop.sourceUrl)) {
      throw new Error(`Stop ${index + 1} has an invalid sourceUrl.`);
    }
  }

  return input as ProvisionalStopImport;
}

async function main() {
  if (!inputPath) {
    throw new Error(
      "Provide a JSON import file. Example: pnpm db:import-provisional-stops -- ./stops.json",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const absolutePath = resolve(inputPath);
  const input = parseImport(JSON.parse(await readFile(absolutePath, "utf8")));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const result = await db.transaction(async (transaction) => {
      let inserted = 0;
      let updated = 0;
      let preserved = 0;

      for (const stop of input.stops) {
        const [existing] = await transaction
          .select({
            id: locations.id,
            isActive: locations.isActive,
            verificationStatus: locations.verificationStatus,
          })
          .from(locations)
          .where(
            and(
              eq(locations.sourceType, input.sourceType),
              eq(locations.sourceExternalId, stop.externalId),
            ),
          )
          .limit(1);

        if (existing?.isActive || existing?.verificationStatus === "verified") {
          preserved += 1;
          continue;
        }

        const provisionalValues = {
          name: stop.name.trim(),
          slug: stop.slug,
          kind: stop.kind,
          description: stop.description?.trim() || null,
          city: stop.city.trim(),
          area: stop.area?.trim() || null,
          coordinates: { x: stop.longitude, y: stop.latitude },
          verificationStatus: "unverified" as const,
          lastVerifiedAt: null,
          sourceType: input.sourceType,
          sourceExternalId: stop.externalId.trim(),
          sourceUrl: stop.sourceUrl ?? input.sourceUrl,
          isActive: false,
          updatedAt: new Date(),
        };

        if (existing) {
          await transaction
            .update(locations)
            .set(provisionalValues)
            .where(eq(locations.id, existing.id));
          updated += 1;
        } else {
          await transaction.insert(locations).values(provisionalValues);
          inserted += 1;
        }
      }

      return { inserted, updated, preserved };
    });

    console.table(result);
    console.log(
      "Import complete. Every new or updated record remains inactive and unverified.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
