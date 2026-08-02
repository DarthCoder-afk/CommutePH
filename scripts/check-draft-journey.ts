import "dotenv/config";

import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeySegments,
  journeySteps,
  journeys,
  transportRouteStops,
} from "@/server/db/schema";

const journeySlug = "one-ayala-to-bgc-high-street-via-bgc-bus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertGaplessPositions(positions: number[], label: string) {
  for (const [index, position] of positions.entries()) {
    const expectedPosition = index + 1;

    assert(
      position === expectedPosition,
      `${label} positions must be gapless. Expected ${expectedPosition}, received ${position}.`,
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        slug: journeys.slug,
        originLocationId: journeys.originLocationId,
        destinationLocationId: journeys.destinationLocationId,
        status: journeys.status,
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug));

    assert(journey, `Journey "${journeySlug}" was not found.`);
    assert(
      journey.status === "draft",
      "The draft journey must have draft status.",
    );
    assert(!journey.isActive, "The draft journey must remain inactive.");

    const segments = await db
      .select({
        id: journeySegments.id,
        position: journeySegments.position,
        kind: journeySegments.kind,
        walkingFromLocationId: journeySegments.walkingFromLocationId,
        walkingToLocationId: journeySegments.walkingToLocationId,
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, journey.id))
      .orderBy(asc(journeySegments.position));

    assert(segments.length > 0, "The journey has no segments.");

    assertGaplessPositions(
      segments.map((segment) => segment.position),
      "Journey segment",
    );

    const stepRows = await db
      .select({
        segmentId: journeySteps.journeySegmentId,
        position: journeySteps.position,
        instruction: journeySteps.instruction,
      })
      .from(journeySteps)
      .innerJoin(
        journeySegments,
        eq(journeySegments.id, journeySteps.journeySegmentId),
      )
      .where(eq(journeySegments.journeyId, journey.id))
      .orderBy(asc(journeySegments.position), asc(journeySteps.position));

    const stepsBySegment = new Map<string, typeof stepRows>();

    for (const step of stepRows) {
      const segmentSteps = stepsBySegment.get(step.segmentId) ?? [];

      segmentSteps.push(step);
      stepsBySegment.set(step.segmentId, segmentSteps);
    }

    for (const segment of segments) {
      const segmentSteps = stepsBySegment.get(segment.id) ?? [];

      assert(
        segmentSteps.length > 0,
        `Segment ${segment.position} has no instructions.`,
      );

      assertGaplessPositions(
        segmentSteps.map((step) => step.position),
        `Segment ${segment.position} step`,
      );

      for (const step of segmentSteps) {
        assert(
          step.instruction.trim().length > 0,
          `Segment ${segment.position}, step ${step.position} has an empty instruction.`,
        );
      }
    }

    const routeStopIds = [
      ...new Set(
        segments
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

    const resolvedSegments = segments.map((segment) => {
      if (segment.kind === "walking") {
        assert(
          segment.walkingFromLocationId,
          `Walking segment ${segment.position} has no starting location.`,
        );
        assert(
          segment.walkingToLocationId,
          `Walking segment ${segment.position} has no ending location.`,
        );

        return {
          position: segment.position,
          kind: segment.kind,
          startLocationId: segment.walkingFromLocationId,
          endLocationId: segment.walkingToLocationId,
        };
      }

      assert(
        segment.boardingRouteStopId,
        `Transit segment ${segment.position} has no boarding stop.`,
      );
      assert(
        segment.alightingRouteStopId,
        `Transit segment ${segment.position} has no alighting stop.`,
      );

      const boardingStop = routeStopsById.get(segment.boardingRouteStopId);
      const alightingStop = routeStopsById.get(segment.alightingRouteStopId);

      assert(
        boardingStop,
        `Transit segment ${segment.position} references a missing boarding stop.`,
      );
      assert(
        alightingStop,
        `Transit segment ${segment.position} references a missing alighting stop.`,
      );

      assert(
        boardingStop.transportRouteId === alightingStop.transportRouteId,
        `Transit segment ${segment.position} uses stops from different transport routes.`,
      );

      assert(
        boardingStop.position < alightingStop.position,
        `Transit segment ${segment.position} boards after its alighting stop.`,
      );

      assert(
        boardingStop.canBoard,
        `Transit segment ${segment.position} uses a stop that does not allow boarding.`,
      );

      assert(
        alightingStop.canAlight,
        `Transit segment ${segment.position} uses a stop that does not allow alighting.`,
      );

      return {
        position: segment.position,
        kind: segment.kind,
        startLocationId: boardingStop.locationId,
        endLocationId: alightingStop.locationId,
      };
    });

    const firstSegment = resolvedSegments[0];
    const lastSegment = resolvedSegments[resolvedSegments.length - 1];

    assert(firstSegment, "The journey has no first segment.");
    assert(lastSegment, "The journey has no last segment.");

    assert(
      firstSegment.startLocationId === journey.originLocationId,
      "The first segment does not start at the journey origin.",
    );

    assert(
      lastSegment.endLocationId === journey.destinationLocationId,
      "The last segment does not end at the journey destination.",
    );

    for (let index = 0; index < resolvedSegments.length - 1; index += 1) {
      const currentSegment = resolvedSegments[index];
      const nextSegment = resolvedSegments[index + 1];

      assert(currentSegment, "A current segment is missing.");
      assert(nextSegment, "A following segment is missing.");

      assert(
        currentSegment.endLocationId === nextSegment.startLocationId,
        `Segments ${currentSegment.position} and ${nextSegment.position} are not continuous.`,
      );
    }

    const transitSegmentCount = segments.filter(
      (segment) => segment.kind === "transit",
    ).length;

    const transferCount = Math.max(0, transitSegmentCount - 1);

    assert(
      transferCount <= 1,
      "The journey exceeds the MVP limit of one transfer.",
    );

    console.table(resolvedSegments);
    console.log("Draft journey integrity passed.");
    console.log(
      `Segments: ${segments.length}, steps: ${stepRows.length}, transfers: ${transferCount}.`,
    );
    console.log("Journey remains draft and inactive.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
