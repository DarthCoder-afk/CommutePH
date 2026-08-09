import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locations,
  routeFieldObservations,
  routeFieldObservationStops,
  transportRoutes,
} from "@/server/db/schema";
import { validateRouteFieldObservation } from "@/server/routes/validate-route-field-observation";

const inputPath = process.argv.slice(2).find((argument) => argument !== "--");

async function readInputFile(path: string) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Route observation file was not found: ${resolve(path)}. Create it only after a real field observation.`,
      );
    }
    throw error;
  }
}

async function main() {
  if (!inputPath) {
    throw new Error(
      "Provide a JSON observation file. Example: pnpm db:record-route-field-observation -- ./route-observation.json",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = validateRouteFieldObservation(await readInputFile(inputPath));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [route] = await db
      .select({
        id: transportRoutes.id,
        name: transportRoutes.name,
        isActive: transportRoutes.isActive,
      })
      .from(transportRoutes)
      .where(eq(transportRoutes.slug, input.routeSlug))
      .limit(1);

    if (!route) {
      throw new Error(`Transport route "${input.routeSlug}" was not found.`);
    }

    const locationSlugs = input.stops.map((stop) => stop.locationSlug);
    const locationRows =
      locationSlugs.length === 0
        ? []
        : await db
            .select({ id: locations.id, slug: locations.slug })
            .from(locations)
            .where(inArray(locations.slug, locationSlugs));
    const locationBySlug = new Map(
      locationRows.map((location) => [location.slug, location]),
    );
    const missingSlugs = locationSlugs.filter(
      (slug) => !locationBySlug.has(slug),
    );

    if (missingSlugs.length > 0) {
      throw new Error(
        `Observed route stops were not found: ${missingSlugs.join(", ")}. Import and review those locations first.`,
      );
    }

    const createdAt = new Date();
    const observation = await db.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(routeFieldObservations)
        .values({
          transportRouteId: route.id,
          outcome: input.outcome,
          observedAt: input.observedAt,
          observerLabel: input.observerLabel,
          notes: input.notes,
          observedName: input.observedName,
          observedMode: input.observedMode,
          observedOperator: input.observedOperator,
          observedSignboard: input.observedSignboard,
          serviceDays: input.serviceDays,
          operatingHours: input.operatingHours,
          fareMinCentavos: input.fareMinCentavos,
          fareMaxCentavos: input.fareMaxCentavos,
          paymentMethod: input.paymentMethod,
          evidenceUrl: input.evidenceUrl,
          createdAt,
        })
        .returning({
          id: routeFieldObservations.id,
          outcome: routeFieldObservations.outcome,
          observedAt: routeFieldObservations.observedAt,
        });

      if (!inserted) throw new Error("Failed to record route observation.");

      if (input.stops.length > 0) {
        await transaction.insert(routeFieldObservationStops).values(
          input.stops.map((stop) => ({
            routeFieldObservationId: inserted.id,
            locationId: locationBySlug.get(stop.locationSlug)!.id,
            position: stop.position,
            canBoard: stop.canBoard,
            canAlight: stop.canAlight,
            notes: stop.notes,
          })),
        );
      }

      await transaction
        .update(routeFieldObservations)
        .set({ finalizedAt: createdAt })
        .where(eq(routeFieldObservations.id, inserted.id));

      return inserted;
    });

    console.table([
      {
        observationId: observation.id,
        route: route.name,
        outcome: observation.outcome,
        observedAt: observation.observedAt.toISOString(),
        stops: input.stops.length,
      },
    ]);
    console.log(
      `Route remains ${route.isActive ? "active" : "inactive"}. No route, stop, schedule, or journey was modified or published.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
