import type { JourneySummary } from "@/lib/journeys/journey-summary";
import {
  calculateJourneyEstimates,
  type JourneyEstimateSegment,
} from "@/server/journeys/calculate-journey-estimates";

export const publishedJourneySearchResultLimit = 10;

export type PublishedJourneySearchEndpoint = {
  id: string;
  slug: string;
  name: string;
};

export type PublishedJourneySearchRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  estimatedDurationMin: number | null;
  estimatedDurationMax: number | null;
  estimatedFareMinCentavos: number | null;
  estimatedFareMaxCentavos: number | null;
  lastVerifiedAt: Date | null;
};

export type PublishedJourneySearchSegment = JourneyEstimateSegment & {
  journeyId: string;
  walkingFromLocationId: string | null;
  walkingToLocationId: string | null;
  boardingRouteStopId: string | null;
  alightingRouteStopId: string | null;
};

export type PublishedJourneySearchRouteStop = {
  id: string;
  transportRouteId: string;
  locationId: string;
  position: number;
  canBoard: boolean;
  canAlight: boolean;
  routeIsActive: boolean;
};

export type PublishedJourneySearchLocation = {
  id: string;
  isActive: boolean;
};

type SegmentTopology = {
  startLocationId: string;
  endLocationId: string;
  routeSignaturePart: string | null;
};

function requireRouteStop(
  routeStopsById: ReadonlyMap<string, PublishedJourneySearchRouteStop>,
  id: string,
  segmentPosition: number,
  role: "boarding" | "alighting",
) {
  const routeStop = routeStopsById.get(id);

  if (!routeStop) {
    throw new Error(
      `Published segment ${segmentPosition} references a missing ${role} stop.`,
    );
  }

  return routeStop;
}

function getSegmentTopology(
  segment: PublishedJourneySearchSegment,
  routeStopsById: ReadonlyMap<string, PublishedJourneySearchRouteStop>,
): SegmentTopology | null {
  if (segment.kind === "walking") {
    if (
      !segment.walkingFromLocationId ||
      !segment.walkingToLocationId ||
      segment.boardingRouteStopId ||
      segment.alightingRouteStopId
    ) {
      throw new Error(
        `Published walking segment ${segment.position} has invalid endpoints.`,
      );
    }

    return {
      startLocationId: segment.walkingFromLocationId,
      endLocationId: segment.walkingToLocationId,
      routeSignaturePart: null,
    };
  }

  if (
    !segment.boardingRouteStopId ||
    !segment.alightingRouteStopId ||
    segment.walkingFromLocationId ||
    segment.walkingToLocationId
  ) {
    throw new Error(
      `Published transit segment ${segment.position} has invalid stops.`,
    );
  }

  const boardingStop = requireRouteStop(
    routeStopsById,
    segment.boardingRouteStopId,
    segment.position,
    "boarding",
  );
  const alightingStop = requireRouteStop(
    routeStopsById,
    segment.alightingRouteStopId,
    segment.position,
    "alighting",
  );

  if (
    !boardingStop.routeIsActive ||
    !alightingStop.routeIsActive ||
    !boardingStop.canBoard ||
    !alightingStop.canAlight
  ) {
    return null;
  }

  if (boardingStop.transportRouteId !== alightingStop.transportRouteId) {
    throw new Error(
      `Published transit segment ${segment.position} uses stops from different routes.`,
    );
  }

  if (boardingStop.position >= alightingStop.position) {
    throw new Error(
      `Published transit segment ${segment.position} travels against its route direction.`,
    );
  }

  return {
    startLocationId: boardingStop.locationId,
    endLocationId: alightingStop.locationId,
    routeSignaturePart: [
      boardingStop.transportRouteId,
      boardingStop.locationId,
      alightingStop.locationId,
    ].join(":"),
  };
}

function hasContinuousLoopFreePath(
  topology: readonly SegmentTopology[],
  originId: string,
  destinationId: string,
) {
  if (
    topology.length === 0 ||
    topology[0]?.startLocationId !== originId ||
    topology.at(-1)?.endLocationId !== destinationId
  ) {
    return false;
  }

  const visitedLocationIds = new Set<string>([originId]);
  let previousEndLocationId = originId;

  for (const segment of topology) {
    if (segment.startLocationId !== previousEndLocationId) {
      return false;
    }

    if (visitedLocationIds.has(segment.endLocationId)) {
      return false;
    }

    visitedLocationIds.add(segment.endLocationId);
    previousEndLocationId = segment.endLocationId;
  }

  return true;
}

export function assemblePublishedJourneySearchResults({
  origin,
  destination,
  journeys,
  segments,
  routeStops,
  locations,
  resultLimit = publishedJourneySearchResultLimit,
}: {
  origin: PublishedJourneySearchEndpoint;
  destination: PublishedJourneySearchEndpoint;
  journeys: readonly PublishedJourneySearchRecord[];
  segments: readonly PublishedJourneySearchSegment[];
  routeStops: readonly PublishedJourneySearchRouteStop[];
  locations: readonly PublishedJourneySearchLocation[];
  resultLimit?: number;
}): JourneySummary[] {
  if (
    !Number.isInteger(resultLimit) ||
    resultLimit < 1 ||
    resultLimit > publishedJourneySearchResultLimit
  ) {
    throw new Error(
      `Published journey result limit must be between 1 and ${publishedJourneySearchResultLimit}.`,
    );
  }

  const segmentsByJourneyId = new Map<
    string,
    PublishedJourneySearchSegment[]
  >();

  for (const segment of segments) {
    const journeySegments = segmentsByJourneyId.get(segment.journeyId) ?? [];

    journeySegments.push(segment);
    segmentsByJourneyId.set(segment.journeyId, journeySegments);
  }

  const routeStopsById = new Map(
    routeStops.map((routeStop) => [routeStop.id, routeStop]),
  );
  const activeLocationIds = new Set(
    locations
      .filter((location) => location.isActive)
      .map((location) => location.id),
  );

  const candidates = journeys.flatMap((journey) => {
    const journeySegments = [
      ...(segmentsByJourneyId.get(journey.id) ?? []),
    ].sort((first, second) => first.position - second.position);

    if (journeySegments.length === 0) {
      throw new Error(
        `Published journey "${journey.slug}" does not have any segments.`,
      );
    }

    let calculation: ReturnType<typeof calculateJourneyEstimates>;

    try {
      calculation = calculateJourneyEstimates(journeySegments);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown calculation error.";

      throw new Error(
        `Published journey "${journey.slug}" has invalid segment estimates: ${reason}`,
      );
    }

    if (calculation.transferCount > 1) {
      return [];
    }

    const transitSegments = journeySegments.filter(
      (segment) => segment.kind === "transit",
    );

    if (transitSegments.length < 1 || transitSegments.length > 2) {
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

    const possibleTopology = journeySegments.map((segment) =>
      getSegmentTopology(segment, routeStopsById),
    );

    if (possibleTopology.some((segment) => segment === null)) {
      return [];
    }

    const topology = possibleTopology.filter(
      (segment): segment is SegmentTopology => segment !== null,
    );

    if (
      topology.some(
        (segment) =>
          !activeLocationIds.has(segment.startLocationId) ||
          !activeLocationIds.has(segment.endLocationId),
      )
    ) {
      return [];
    }

    if (!hasContinuousLoopFreePath(topology, origin.id, destination.id)) {
      return [];
    }

    const routeSignature = topology
      .flatMap((segment) =>
        segment.routeSignaturePart ? [segment.routeSignaturePart] : [],
      )
      .join(">");

    return [
      {
        routeSignature,
        result: {
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
          lastVerifiedAt: journey.lastVerifiedAt.toISOString(),
        },
      },
    ];
  });

  candidates.sort((first, second) => {
    return (
      first.result.transferCount - second.result.transferCount ||
      first.result.estimatedDuration.maxMinutes -
        second.result.estimatedDuration.maxMinutes ||
      first.result.estimatedFare.minCentavos -
        second.result.estimatedFare.minCentavos ||
      first.result.title.localeCompare(second.result.title) ||
      first.result.slug.localeCompare(second.result.slug)
    );
  });

  const seenRouteSignatures = new Set<string>();
  const results: JourneySummary[] = [];

  for (const candidate of candidates) {
    if (seenRouteSignatures.has(candidate.routeSignature)) {
      continue;
    }

    seenRouteSignatures.add(candidate.routeSignature);
    results.push(candidate.result);

    if (results.length === resultLimit) {
      break;
    }
  }

  return results;
}
