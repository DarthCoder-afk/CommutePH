import { currentLocationWalkingEstimate } from "@/config/walking-estimate";

import type { JourneySummary } from "./journey-summary";
import type { PickupJourneyMatch } from "./search-pickup-journeys";

type JourneyPickupCandidate = {
  location: {
    id: string;
    slug: string;
    name: string;
    city: string;
    area: string | null;
    longitude: number;
    latitude: number;
  };
  distanceMeters: number;
};

export type CurrentLocationJourneyOption = {
  id: string;
  rank: number;
  isRecommended: boolean;
  pickup: JourneyPickupCandidate["location"];
  initialWalkingSegment: {
    kind: "walking";
    summary: string;
    estimatedDistanceMeters: number;
    estimatedDuration: {
      minMinutes: number;
      maxMinutes: number;
    };
    verificationStatus: "estimated";
  };
  publishedJourney: JourneySummary;
  estimatedTotalDuration: {
    minMinutes: number;
    maxMinutes: number;
  };
  estimatedFare: JourneySummary["estimatedFare"];
  totalWalkingDistance: {
    knownMeters: number;
    coverage: "initial-segment-only";
  };
};

function buildInitialWalkingSegment(candidate: JourneyPickupCandidate) {
  if (
    !Number.isFinite(candidate.distanceMeters) ||
    candidate.distanceMeters < 0
  ) {
    throw new Error(
      `Pickup candidate "${candidate.location.slug}" has an invalid distance.`,
    );
  }

  const estimatedDistanceMeters = Math.max(
    10,
    Math.round(
      (candidate.distanceMeters *
        currentLocationWalkingEstimate.routeDistanceMultiplier) /
        10,
    ) * 10,
  );
  const minMinutes = Math.max(
    1,
    Math.ceil(
      estimatedDistanceMeters /
        currentLocationWalkingEstimate.fastestMetersPerMinute,
    ),
  );
  const maxMinutes = Math.max(
    minMinutes,
    Math.ceil(
      estimatedDistanceMeters /
        currentLocationWalkingEstimate.slowestMetersPerMinute,
    ),
  );

  return {
    kind: "walking" as const,
    summary: `Walk from your current location to ${candidate.location.name}.`,
    estimatedDistanceMeters,
    estimatedDuration: {
      minMinutes,
      maxMinutes,
    },
    verificationStatus: "estimated" as const,
  };
}

export function buildCurrentLocationJourneyOptions(
  matches: readonly PickupJourneyMatch<
    JourneyPickupCandidate,
    JourneySummary
  >[],
): CurrentLocationJourneyOption[] {
  const options = matches.flatMap((match) => {
    const initialWalkingSegment = buildInitialWalkingSegment(match.candidate);

    return match.journeys.map((journey) => ({
      id: `${match.candidate.location.id}:${journey.id}`,
      pickup: match.candidate.location,
      initialWalkingSegment,
      publishedJourney: journey,
      estimatedTotalDuration: {
        minMinutes:
          initialWalkingSegment.estimatedDuration.minMinutes +
          journey.estimatedDuration.minMinutes,
        maxMinutes:
          initialWalkingSegment.estimatedDuration.maxMinutes +
          journey.estimatedDuration.maxMinutes,
      },
      estimatedFare: journey.estimatedFare,
      totalWalkingDistance: {
        knownMeters: initialWalkingSegment.estimatedDistanceMeters,
        coverage: "initial-segment-only" as const,
      },
    }));
  });

  options.sort((first, second) => {
    return (
      first.estimatedTotalDuration.maxMinutes -
        second.estimatedTotalDuration.maxMinutes ||
      first.estimatedFare.minCentavos - second.estimatedFare.minCentavos ||
      first.initialWalkingSegment.estimatedDistanceMeters -
        second.initialWalkingSegment.estimatedDistanceMeters ||
      first.publishedJourney.title.localeCompare(second.publishedJourney.title)
    );
  });

  return options.map((option, index) => ({
    ...option,
    rank: index + 1,
    isRecommended: index === 0,
  }));
}
