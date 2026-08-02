import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  calculateJourneyEstimates,
  type JourneyEstimateSegment,
} from "@/server/journeys/calculate-journey-estimates";
import { db } from "@/server/db";
import { journeySegments, journeys, locations } from "@/server/db/schema";

export async function searchPublishedDirectJourneys(
  originSlug: string,
  destinationSlug: string,
) {
  const endpointRows = await db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
    })
    .from(locations)
    .where(
      and(
        inArray(locations.slug, [originSlug, destinationSlug]),
        eq(locations.isActive, true),
      ),
    );

  const endpointsBySlug = new Map(
    endpointRows.map((location) => [location.slug, location]),
  );

  const origin = endpointsBySlug.get(originSlug);
  const destination = endpointsBySlug.get(destinationSlug);

  if (!origin || !destination) {
    return [];
  }

  const candidateJourneys = await db
    .select({
      id: journeys.id,
      slug: journeys.slug,
      title: journeys.title,
      summary: journeys.summary,
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
        eq(journeys.originLocationId, origin.id),
        eq(journeys.destinationLocationId, destination.id),
        eq(journeys.status, "verified"),
        eq(journeys.isActive, true),
      ),
    )
    .orderBy(asc(journeys.estimatedDurationMin), asc(journeys.title))
    .limit(20);

  if (candidateJourneys.length === 0) {
    return [];
  }

  const segmentRows = await db
    .select({
      journeyId: journeySegments.journeyId,
      id: journeySegments.id,
      position: journeySegments.position,
      kind: journeySegments.kind,
      estimatedDurationMin: journeySegments.estimatedDurationMin,
      estimatedDurationMax: journeySegments.estimatedDurationMax,
      estimatedFareMinCentavos: journeySegments.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: journeySegments.estimatedFareMaxCentavos,
    })
    .from(journeySegments)
    .where(
      inArray(
        journeySegments.journeyId,
        candidateJourneys.map((journey) => journey.id),
      ),
    )
    .orderBy(asc(journeySegments.journeyId), asc(journeySegments.position));

  const segmentsByJourneyId = new Map<string, JourneyEstimateSegment[]>();

  for (const row of segmentRows) {
    const segments = segmentsByJourneyId.get(row.journeyId) ?? [];

    segments.push({
      id: row.id,
      position: row.position,
      kind: row.kind,
      estimatedDurationMin: row.estimatedDurationMin,
      estimatedDurationMax: row.estimatedDurationMax,
      estimatedFareMinCentavos: row.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: row.estimatedFareMaxCentavos,
    });

    segmentsByJourneyId.set(row.journeyId, segments);
  }

  const assembledJourneys = candidateJourneys.flatMap((journey) => {
    const segments = segmentsByJourneyId.get(journey.id) ?? [];

    if (segments.length === 0) {
      throw new Error(
        `Published journey "${journey.slug}" does not have any segments.`,
      );
    }

    let calculation: ReturnType<typeof calculateJourneyEstimates>;

    try {
      calculation = calculateJourneyEstimates(segments);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown calculation error.";

      throw new Error(
        `Published journey "${journey.slug}" has invalid segment estimates: ${reason}`,
      );
    }

    // A direct journey may use at most one transit segment.
    if (calculation.transferCount !== 0) {
      return [];
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

    if (
      journey.estimatedDurationMin !==
        calculation.estimatedDuration.minMinutes ||
      journey.estimatedDurationMax !== calculation.estimatedDuration.maxMinutes
    ) {
      throw new Error(
        `Published journey "${journey.slug}" duration totals do not match its segments.`,
      );
    }

    if (
      journey.estimatedFareMinCentavos !==
        calculation.estimatedFare.minCentavos ||
      journey.estimatedFareMaxCentavos !== calculation.estimatedFare.maxCentavos
    ) {
      throw new Error(
        `Published journey "${journey.slug}" fare totals do not match its segments.`,
      );
    }

    return [
      {
        journey,
        calculation,
        lastVerifiedAt: journey.lastVerifiedAt.toISOString(),
      },
    ];
  });

  return assembledJourneys.map(({ journey, calculation, lastVerifiedAt }) => ({
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
    estimatedDuration: calculation.estimatedDuration,
    estimatedFare: calculation.estimatedFare,
    transferCount: calculation.transferCount,
    verificationStatus: "verified" as const,
    lastVerifiedAt,
  }));
}
