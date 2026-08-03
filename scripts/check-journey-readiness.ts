import "dotenv/config";

import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeySegments,
  journeySources,
  journeySteps,
  journeys,
  locations,
  transportRoutes,
  transportRouteSchedules,
  transportRouteStops,
} from "@/server/db/schema";

import { calculateJourneyEstimates } from "@/server/journeys/calculate-journey-estimates";
import { assemblePublishedRouteSchedules } from "@/server/routes/assemble-published-route-schedules";

const journeySlug = process.argv.slice(2).find((argument) => argument !== "--");

function checkGaplessPositions(
  positions: number[],
  label: string,
  addBlocker: (message: string) => void,
) {
  const sortedPositions = [...positions].sort(
    (first, second) => first - second,
  );

  for (const [index, position] of sortedPositions.entries()) {
    const expectedPosition = index + 1;

    if (position !== expectedPosition) {
      addBlocker(
        `${label} positions are not gapless. Expected ${expectedPosition}, received ${position}.`,
      );
      return;
    }
  }
}

async function main() {
  if (!journeySlug) {
    throw new Error(
      "Provide a journey slug. Example: pnpm db:check-journey-readiness -- one-ayala-to-bgc-high-street-via-bgc-bus",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);
  const blockers = new Set<string>();

  function addBlocker(message: string) {
    blockers.add(message);
  }

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        slug: journeys.slug,
        title: journeys.title,
        originLocationId: journeys.originLocationId,
        destinationLocationId: journeys.destinationLocationId,
        estimatedDurationMin: journeys.estimatedDurationMin,
        estimatedDurationMax: journeys.estimatedDurationMax,
        estimatedFareMinCentavos: journeys.estimatedFareMinCentavos,
        estimatedFareMaxCentavos: journeys.estimatedFareMaxCentavos,
        status: journeys.status,
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug))
      .limit(1);

    if (!journey) {
      throw new Error(`Journey "${journeySlug}" was not found.`);
    }

    if (
      journey.estimatedDurationMin === null ||
      journey.estimatedDurationMax === null
    ) {
      addBlocker("The journey needs a complete estimated duration.");
    }

    if (
      journey.estimatedFareMinCentavos === null ||
      journey.estimatedFareMaxCentavos === null
    ) {
      addBlocker("The journey needs a complete estimated fare.");
    }

    const sourceRows = await db
      .select({
        id: journeySources.id,
        sourceType: journeySources.sourceType,
        checkedAt: journeySources.checkedAt,
      })
      .from(journeySources)
      .where(eq(journeySources.journeyId, journey.id));

    if (sourceRows.length === 0) {
      addBlocker(
        "The journey needs at least one verification source or field check.",
      );
    }

    const currentTime = new Date();

    for (const source of sourceRows) {
      if (source.checkedAt > currentTime) {
        addBlocker(
          `Verification source "${source.id}" has a future checked-at date.`,
        );
      }
    }

    const segmentRows = await db
      .select({
        id: journeySegments.id,
        position: journeySegments.position,
        kind: journeySegments.kind,
        walkingFromLocationId: journeySegments.walkingFromLocationId,
        walkingToLocationId: journeySegments.walkingToLocationId,
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
        estimatedDurationMin: journeySegments.estimatedDurationMin,
        estimatedDurationMax: journeySegments.estimatedDurationMax,
        estimatedFareMinCentavos: journeySegments.estimatedFareMinCentavos,
        estimatedFareMaxCentavos: journeySegments.estimatedFareMaxCentavos,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, journey.id))
      .orderBy(asc(journeySegments.position));

    if (segmentRows.length === 0) {
      addBlocker("The journey needs at least one segment.");
    }

    checkGaplessPositions(
      segmentRows.map((segment) => segment.position),
      "Journey segment",
      addBlocker,
    );

    for (const segment of segmentRows) {
      if (
        segment.estimatedDurationMin === null ||
        segment.estimatedDurationMax === null
      ) {
        addBlocker(
          `Segment ${segment.position} needs a complete estimated duration.`,
        );
      }

      if (
        segment.kind === "transit" &&
        (segment.estimatedFareMinCentavos === null ||
          segment.estimatedFareMaxCentavos === null)
      ) {
        addBlocker(
          `Transit segment ${segment.position} needs a complete estimated fare.`,
        );
      }
    }

    const positionsAreGapless = segmentRows.every(
      (segment, index) => segment.position === index + 1,
    );

    const segmentsHaveCalculableEstimates =
      segmentRows.length > 0 &&
      positionsAreGapless &&
      segmentRows.every((segment) => {
        const durationIsComplete =
          segment.estimatedDurationMin !== null &&
          segment.estimatedDurationMax !== null;

        if (!durationIsComplete) {
          return false;
        }

        if (segment.kind === "walking") {
          return true;
        }

        return (
          segment.estimatedFareMinCentavos !== null &&
          segment.estimatedFareMaxCentavos !== null
        );
      });

    if (segmentsHaveCalculableEstimates) {
      try {
        const calculation = calculateJourneyEstimates(segmentRows);

        if (calculation.transferCount > 1) {
          addBlocker(
            `The journey has ${calculation.transferCount} transfers, exceeding the MVP limit of one transfer.`,
          );
        }

        const journeyTotalsAreComplete =
          journey.estimatedDurationMin !== null &&
          journey.estimatedDurationMax !== null &&
          journey.estimatedFareMinCentavos !== null &&
          journey.estimatedFareMaxCentavos !== null;

        if (journeyTotalsAreComplete) {
          if (
            journey.estimatedDurationMin !==
              calculation.estimatedDuration.minMinutes ||
            journey.estimatedDurationMax !==
              calculation.estimatedDuration.maxMinutes
          ) {
            addBlocker(
              "The stored journey duration does not match the sum of its segment durations.",
            );
          }

          if (
            journey.estimatedFareMinCentavos !==
              calculation.estimatedFare.minCentavos ||
            journey.estimatedFareMaxCentavos !==
              calculation.estimatedFare.maxCentavos
          ) {
            addBlocker(
              "The stored journey fare does not match the sum of its transit segment fares.",
            );
          }
        }
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Unknown calculation error.";

        addBlocker(`Journey estimate calculation failed: ${reason}`);
      }
    }

    const segmentIds = segmentRows.map((segment) => segment.id);

    const stepRows =
      segmentIds.length === 0
        ? []
        : await db
            .select({
              journeySegmentId: journeySteps.journeySegmentId,
              position: journeySteps.position,
            })
            .from(journeySteps)
            .where(inArray(journeySteps.journeySegmentId, segmentIds));

    const stepPositionsBySegmentId = new Map<string, number[]>();

    for (const step of stepRows) {
      const positions =
        stepPositionsBySegmentId.get(step.journeySegmentId) ?? [];

      positions.push(step.position);
      stepPositionsBySegmentId.set(step.journeySegmentId, positions);
    }

    for (const segment of segmentRows) {
      const positions = stepPositionsBySegmentId.get(segment.id) ?? [];

      if (positions.length === 0) {
        addBlocker(
          `Segment ${segment.position} needs at least one instruction.`,
        );
        continue;
      }

      checkGaplessPositions(
        positions,
        `Segment ${segment.position} step`,
        addBlocker,
      );
    }

    const routeStopIds = [
      ...new Set(
        segmentRows
          .flatMap((segment) => [
            segment.boardingRouteStopId,
            segment.alightingRouteStopId,
          ])
          .filter((id): id is string => id !== null),
      ),
    ];

    const routeStopRows =
      routeStopIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteStops.id,
              transportRouteId: transportRouteStops.transportRouteId,
              locationId: transportRouteStops.locationId,
              position: transportRouteStops.position,
              canBoard: transportRouteStops.canBoard,
              canAlight: transportRouteStops.canAlight,
            })
            .from(transportRouteStops)
            .where(inArray(transportRouteStops.id, routeStopIds));

    const routeStopsById = new Map(
      routeStopRows.map((routeStop) => [routeStop.id, routeStop]),
    );

    const routeIds = [
      ...new Set(routeStopRows.map((routeStop) => routeStop.transportRouteId)),
    ];

    const routeRows =
      routeIds.length === 0
        ? []
        : await db
            .select({
              id: transportRoutes.id,
              name: transportRoutes.name,
              isActive: transportRoutes.isActive,
            })
            .from(transportRoutes)
            .where(inArray(transportRoutes.id, routeIds));

    const routesById = new Map(routeRows.map((route) => [route.id, route]));

    const scheduleRows =
      routeIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteSchedules.id,
              transportRouteId: transportRouteSchedules.transportRouteId,
              position: transportRouteSchedules.position,
              serviceDays: transportRouteSchedules.serviceDays,
              operatingHours: transportRouteSchedules.operatingHours,
              publicNotes: transportRouteSchedules.publicNotes,
              lastVerifiedAt: transportRouteSchedules.lastVerifiedAt,
              isActive: transportRouteSchedules.isActive,
            })
            .from(transportRouteSchedules)
            .where(inArray(transportRouteSchedules.transportRouteId, routeIds));

    for (const route of routeRows) {
      try {
        assemblePublishedRouteSchedules(route.id, scheduleRows, currentTime);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Unknown schedule error.";

        addBlocker(
          `Transport route "${route.name}" schedule validation failed: ${reason}`,
        );
      }
    }

    const relatedLocationIds = [
      ...new Set([
        journey.originLocationId,
        journey.destinationLocationId,
        ...segmentRows
          .flatMap((segment) => [
            segment.walkingFromLocationId,
            segment.walkingToLocationId,
          ])
          .filter((id): id is string => id !== null),
        ...routeStopRows.map((routeStop) => routeStop.locationId),
      ]),
    ];

    const locationRows = await db
      .select({
        id: locations.id,
        name: locations.name,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(inArray(locations.id, relatedLocationIds));

    const locationsById = new Map(
      locationRows.map((location) => [location.id, location]),
    );

    function checkActiveLocation(locationId: string, label: string) {
      const location = locationsById.get(locationId);

      if (!location) {
        addBlocker(`${label} references a missing location.`);
        return;
      }

      if (!location.isActive) {
        addBlocker(`${label} location "${location.name}" is inactive.`);
      }
    }

    checkActiveLocation(journey.originLocationId, "Journey origin");

    checkActiveLocation(journey.destinationLocationId, "Journey destination");

    for (const segment of segmentRows) {
      if (segment.kind === "walking") {
        if (segment.walkingFromLocationId) {
          checkActiveLocation(
            segment.walkingFromLocationId,
            `Walking segment ${segment.position} start`,
          );
        }

        if (segment.walkingToLocationId) {
          checkActiveLocation(
            segment.walkingToLocationId,
            `Walking segment ${segment.position} end`,
          );
        }

        continue;
      }

      if (!segment.boardingRouteStopId || !segment.alightingRouteStopId) {
        addBlocker(
          `Transit segment ${segment.position} needs boarding and alighting stops.`,
        );
        continue;
      }

      const boardingStop = routeStopsById.get(segment.boardingRouteStopId);

      const alightingStop = routeStopsById.get(segment.alightingRouteStopId);

      if (!boardingStop || !alightingStop) {
        addBlocker(
          `Transit segment ${segment.position} references a missing route stop.`,
        );
        continue;
      }

      if (boardingStop.transportRouteId !== alightingStop.transportRouteId) {
        addBlocker(
          `Transit segment ${segment.position} uses stops from different routes.`,
        );
        continue;
      }

      const route = routesById.get(boardingStop.transportRouteId);

      if (!route) {
        addBlocker(
          `Transit segment ${segment.position} references a missing route.`,
        );
      } else if (!route.isActive) {
        addBlocker(`Transit route "${route.name}" is inactive.`);
      }

      checkActiveLocation(
        boardingStop.locationId,
        `Transit segment ${segment.position} boarding stop`,
      );

      checkActiveLocation(
        alightingStop.locationId,
        `Transit segment ${segment.position} alighting stop`,
      );

      if (!boardingStop.canBoard) {
        addBlocker(
          `Transit segment ${segment.position} does not allow boarding at its first stop.`,
        );
      }

      if (!alightingStop.canAlight) {
        addBlocker(
          `Transit segment ${segment.position} does not allow alighting at its final stop.`,
        );
      }

      if (boardingStop.position >= alightingStop.position) {
        addBlocker(
          `Transit segment ${segment.position} boards after its alighting stop.`,
        );
      }
    }

    console.log(`Journey: ${journey.title}`);
    console.log(`Current status: ${journey.status}`);
    console.log(`Currently active: ${journey.isActive}`);

    if (blockers.size > 0) {
      console.error(
        `\nNot ready to publish. Found ${blockers.size} blocker(s):`,
      );

      for (const blocker of blockers) {
        console.error(`- ${blocker}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log(
      "\nPublication readiness passed. This command did not modify the journey.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
