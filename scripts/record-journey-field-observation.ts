import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeyFieldObservations,
  journeyFieldObservationSegments,
  journeyFieldObservationSteps,
  journeySegments,
  journeys,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";
import {
  lineStringToEwkt,
  validateJourneyFieldObservation,
} from "@/server/journeys/validate-journey-field-observation";

const inputPath = process.argv.slice(2).find((argument) => argument !== "--");

async function readInputFile(path: string) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Journey observation file was not found: ${resolve(path)}. Create it only after a real field test.`,
      );
    }
    throw error;
  }
}

async function main() {
  if (!inputPath) {
    throw new Error(
      "Provide a JSON observation file. Example: pnpm db:record-journey-field-observation -- ./journey-observation.json",
    );
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not defined.");

  const input = validateJourneyFieldObservation(await readInputFile(inputPath));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        title: journeys.title,
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, input.journeySlug))
      .limit(1);
    if (!journey)
      throw new Error(`Journey "${input.journeySlug}" was not found.`);

    const storedSegments = await db
      .select({
        id: journeySegments.id,
        position: journeySegments.position,
        kind: journeySegments.kind,
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, journey.id));
    const storedSegmentByPosition = new Map(
      storedSegments.map((segment) => [segment.position, segment]),
    );

    if (
      input.outcome === "confirmed" &&
      input.segments.length !== storedSegments.length
    ) {
      throw new Error(
        "A confirmed field test must contain every stored journey segment.",
      );
    }

    const routeStopIds = storedSegments.flatMap((segment) =>
      [segment.boardingRouteStopId, segment.alightingRouteStopId].filter(
        (id): id is string => id !== null,
      ),
    );
    const routeStops =
      routeStopIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteStops.id,
              transportRouteId: transportRouteStops.transportRouteId,
            })
            .from(transportRouteStops)
            .where(inArray(transportRouteStops.id, routeStopIds));
    const routeStopById = new Map(routeStops.map((stop) => [stop.id, stop]));
    const routeSlugs = input.segments.flatMap((segment) =>
      segment.routeSlug ? [segment.routeSlug] : [],
    );
    const routes =
      routeSlugs.length === 0
        ? []
        : await db
            .select({ id: transportRoutes.id, slug: transportRoutes.slug })
            .from(transportRoutes)
            .where(inArray(transportRoutes.slug, routeSlugs));
    const routeBySlug = new Map(routes.map((route) => [route.slug, route]));

    const preparedSegments = input.segments.map((observedSegment) => {
      const storedSegment = storedSegmentByPosition.get(
        observedSegment.position,
      );
      if (!storedSegment || storedSegment.kind !== observedSegment.kind) {
        throw new Error(
          `Observed segment ${observedSegment.position} does not match the stored journey structure.`,
        );
      }

      let observedTransportRouteId: string | null = null;
      if (observedSegment.kind === "transit") {
        const observedRoute = observedSegment.routeSlug
          ? routeBySlug.get(observedSegment.routeSlug)
          : null;
        if (!observedRoute) {
          throw new Error(
            `Observed route "${observedSegment.routeSlug}" was not found.`,
          );
        }
        const boardingRouteId = storedSegment.boardingRouteStopId
          ? routeStopById.get(storedSegment.boardingRouteStopId)
              ?.transportRouteId
          : null;
        const alightingRouteId = storedSegment.alightingRouteStopId
          ? routeStopById.get(storedSegment.alightingRouteStopId)
              ?.transportRouteId
          : null;
        if (
          boardingRouteId !== observedRoute.id ||
          alightingRouteId !== observedRoute.id
        ) {
          throw new Error(
            `Observed route for segment ${observedSegment.position} does not match its stored boarding and alighting stops.`,
          );
        }
        observedTransportRouteId = observedRoute.id;
      }

      return { observedSegment, storedSegment, observedTransportRouteId };
    });

    const createdAt = new Date();
    const observation = await db.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(journeyFieldObservations)
        .values({
          journeyId: journey.id,
          outcome: input.outcome,
          observedAt: input.observedAt,
          observerLabel: input.observerLabel,
          notes: input.notes,
          actualDurationMinutes: input.actualDurationMinutes,
          actualFareCentavos: input.actualFareCentavos,
          actualTransferCount: input.actualTransferCount,
          evidenceUrl: input.evidenceUrl,
          createdAt,
        })
        .returning({ id: journeyFieldObservations.id });
      if (!inserted) throw new Error("Failed to record journey observation.");

      for (const prepared of preparedSegments) {
        const { observedSegment, storedSegment, observedTransportRouteId } =
          prepared;
        const [insertedSegment] = await transaction
          .insert(journeyFieldObservationSegments)
          .values({
            journeyFieldObservationId: inserted.id,
            journeySegmentId: storedSegment.id,
            position: observedSegment.position,
            kind: observedSegment.kind,
            observedTransportRouteId,
            actualDurationMinutes: observedSegment.actualDurationMinutes,
            actualFareCentavos: observedSegment.actualFareCentavos,
            pathGeometry: observedSegment.path
              ? lineStringToEwkt(observedSegment.path.coordinates)
              : null,
            notes: observedSegment.notes,
          })
          .returning({ id: journeyFieldObservationSegments.id });
        if (!insertedSegment)
          throw new Error("Failed to record journey segment.");

        if (observedSegment.steps.length > 0) {
          await transaction.insert(journeyFieldObservationSteps).values(
            observedSegment.steps.map((instruction, index) => ({
              journeyFieldObservationSegmentId: insertedSegment.id,
              position: index + 1,
              instruction,
            })),
          );
        }
      }

      await transaction
        .update(journeyFieldObservations)
        .set({ finalizedAt: createdAt })
        .where(eq(journeyFieldObservations.id, inserted.id));

      return inserted;
    });

    console.table([
      {
        observationId: observation.id,
        journey: journey.title,
        outcome: input.outcome,
        durationMinutes: input.actualDurationMinutes,
        fareCentavos: input.actualFareCentavos,
        transfers: input.actualTransferCount,
        segments: input.segments.length,
      },
    ]);
    console.log(
      `Journey remains ${journey.isActive ? "active" : "inactive"}. No journey, segment, route, or location was verified, changed, activated, or published.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
