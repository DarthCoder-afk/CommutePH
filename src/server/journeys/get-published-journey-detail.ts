import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  journeySegments,
  journeySteps,
  journeys,
  locations,
} from "@/server/db/schema";

function getOptionalRange(
  minimum: number | null,
  maximum: number | null,
  label: string,
) {
  if (minimum === null && maximum === null) {
    return null;
  }

  if (minimum === null || maximum === null) {
    throw new Error(`${label} has an incomplete range.`);
  }

  return {
    minimum,
    maximum,
  };
}

export async function getPublishedJourneyDetail(slug: string) {
  const [journey] = await db
    .select({
      id: journeys.id,
      slug: journeys.slug,
      title: journeys.title,
      summary: journeys.summary,
      originLocationId: journeys.originLocationId,
      destinationLocationId: journeys.destinationLocationId,
      estimatedDurationMin: journeys.estimatedDurationMin,
      estimatedDurationMax: journeys.estimatedDurationMax,
      estimatedFareMinCentavos: journeys.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: journeys.estimatedFareMaxCentavos,
      status: journeys.status,
      lastVerifiedAt: journeys.lastVerifiedAt,
    })
    .from(journeys)
    .where(
      and(
        eq(journeys.slug, slug),
        eq(journeys.status, "verified"),
        eq(journeys.isActive, true),
      ),
    )
    .limit(1);

  if (!journey) {
    return null;
  }

  const endpointRows = await db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
    })
    .from(locations)
    .where(
      and(
        inArray(locations.id, [
          journey.originLocationId,
          journey.destinationLocationId,
        ]),
        eq(locations.isActive, true),
      ),
    );

  const endpointsById = new Map(
    endpointRows.map((location) => [location.id, location]),
  );

  const origin = endpointsById.get(journey.originLocationId);
  const destination = endpointsById.get(journey.destinationLocationId);

  if (!origin || !destination) {
    throw new Error(
      `Published journey "${journey.slug}" has an inactive or missing endpoint.`,
    );
  }

  if (
    journey.estimatedDurationMin === null ||
    journey.estimatedDurationMax === null ||
    journey.estimatedFareMinCentavos === null ||
    journey.estimatedFareMaxCentavos === null ||
    journey.lastVerifiedAt === null
  ) {
    throw new Error(
      `Published journey "${journey.slug}" has incomplete verification data.`,
    );
  }

  const segmentRows = await db
    .select({
      id: journeySegments.id,
      position: journeySegments.position,
      kind: journeySegments.kind,
      summary: journeySegments.summary,
      estimatedDurationMin: journeySegments.estimatedDurationMin,
      estimatedDurationMax: journeySegments.estimatedDurationMax,
      estimatedFareMinCentavos: journeySegments.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: journeySegments.estimatedFareMaxCentavos,
    })
    .from(journeySegments)
    .where(eq(journeySegments.journeyId, journey.id))
    .orderBy(asc(journeySegments.position));

  if (segmentRows.length === 0) {
    throw new Error(
      `Published journey "${journey.slug}" does not have any segments.`,
    );
  }

  const stepRows = await db
    .select({
      id: journeySteps.id,
      journeySegmentId: journeySteps.journeySegmentId,
      position: journeySteps.position,
      instruction: journeySteps.instruction,
    })
    .from(journeySteps)
    .where(
      inArray(
        journeySteps.journeySegmentId,
        segmentRows.map((segment) => segment.id),
      ),
    )
    .orderBy(asc(journeySteps.position));

  const stepsBySegmentId = new Map<
    string,
    Array<{
      id: string;
      position: number;
      instruction: string;
    }>
  >();

  for (const step of stepRows) {
    const segmentSteps = stepsBySegmentId.get(step.journeySegmentId) ?? [];

    segmentSteps.push({
      id: step.id,
      position: step.position,
      instruction: step.instruction,
    });

    stepsBySegmentId.set(step.journeySegmentId, segmentSteps);
  }

  const segments = segmentRows.map((segment) => {
    const steps = stepsBySegmentId.get(segment.id) ?? [];

    if (steps.length === 0) {
      throw new Error(
        `Published journey "${journey.slug}" has a segment without instructions.`,
      );
    }

    const durationRange = getOptionalRange(
      segment.estimatedDurationMin,
      segment.estimatedDurationMax,
      `Journey segment ${segment.position} duration`,
    );

    const fareRange = getOptionalRange(
      segment.estimatedFareMinCentavos,
      segment.estimatedFareMaxCentavos,
      `Journey segment ${segment.position} fare`,
    );

    return {
      id: segment.id,
      position: segment.position,
      kind: segment.kind,
      summary: segment.summary,
      estimatedDuration: durationRange
        ? {
            minMinutes: durationRange.minimum,
            maxMinutes: durationRange.maximum,
          }
        : null,
      estimatedFare: fareRange
        ? {
            minCentavos: fareRange.minimum,
            maxCentavos: fareRange.maximum,
            currency: "PHP" as const,
          }
        : null,
      steps,
    };
  });

  const transitSegmentCount = segments.filter(
    (segment) => segment.kind === "transit",
  ).length;

  return {
    id: journey.id,
    slug: journey.slug,
    title: journey.title,
    summary: journey.summary,
    origin: {
      slug: origin.slug,
      name: origin.name,
    },
    destination: {
      slug: destination.slug,
      name: destination.name,
    },
    estimatedDuration: {
      minMinutes: journey.estimatedDurationMin,
      maxMinutes: journey.estimatedDurationMax,
    },
    estimatedFare: {
      minCentavos: journey.estimatedFareMinCentavos,
      maxCentavos: journey.estimatedFareMaxCentavos,
      currency: "PHP" as const,
    },
    transferCount: Math.max(0, transitSegmentCount - 1),
    verificationStatus: "verified" as const,
    lastVerifiedAt: journey.lastVerifiedAt.toISOString(),
    segments,
  };
}
