import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

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
      kind: journeySegments.kind,
    })
    .from(journeySegments)
    .where(
      inArray(
        journeySegments.journeyId,
        candidateJourneys.map((journey) => journey.id),
      ),
    );

  const segmentStats = new Map<
    string,
    {
      total: number;
      transit: number;
    }
  >();

  for (const segment of segmentRows) {
    const stats = segmentStats.get(segment.journeyId) ?? {
      total: 0,
      transit: 0,
    };

    stats.total += 1;

    if (segment.kind === "transit") {
      stats.transit += 1;
    }

    segmentStats.set(segment.journeyId, stats);
  }

  const directJourneys = candidateJourneys.filter((journey) => {
    const stats = segmentStats.get(journey.id);

    return stats !== undefined && stats.total > 0 && stats.transit <= 1;
  });

  return directJourneys.map((journey) => {
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
      transferCount: 0,
      verificationStatus: journey.status,
      lastVerifiedAt: journey.lastVerifiedAt.toISOString(),
    };
  });
}
