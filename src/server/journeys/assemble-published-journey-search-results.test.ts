import assert from "node:assert/strict";
import test from "node:test";

import {
  assemblePublishedJourneySearchResults,
  type PublishedJourneySearchRecord,
  type PublishedJourneySearchRouteStop,
  type PublishedJourneySearchSegment,
} from "./assemble-published-journey-search-results";

/*
 * Development-only records. Names, routes, fares, and durations are
 * intentionally provisional and do not represent commuter guidance.
 */
const origin = {
  id: "location-origin",
  slug: "provisional-origin",
  name: "Provisional Origin",
};
const transfer = {
  id: "location-transfer",
  slug: "provisional-transfer",
  name: "Provisional Transfer",
};
const destination = {
  id: "location-destination",
  slug: "provisional-destination",
  name: "Provisional Destination",
};
const locations = [origin, transfer, destination].map((location) => ({
  id: location.id,
  isActive: true,
}));

const routeStops: PublishedJourneySearchRouteStop[] = [
  {
    id: "route-one-origin",
    transportRouteId: "route-one",
    locationId: origin.id,
    position: 1,
    canBoard: true,
    canAlight: true,
    routeIsActive: true,
  },
  {
    id: "route-one-transfer",
    transportRouteId: "route-one",
    locationId: transfer.id,
    position: 2,
    canBoard: true,
    canAlight: true,
    routeIsActive: true,
  },
  {
    id: "route-one-destination",
    transportRouteId: "route-one",
    locationId: destination.id,
    position: 3,
    canBoard: true,
    canAlight: true,
    routeIsActive: true,
  },
  {
    id: "route-two-transfer",
    transportRouteId: "route-two",
    locationId: transfer.id,
    position: 1,
    canBoard: true,
    canAlight: true,
    routeIsActive: true,
  },
  {
    id: "route-two-destination",
    transportRouteId: "route-two",
    locationId: destination.id,
    position: 2,
    canBoard: true,
    canAlight: true,
    routeIsActive: true,
  },
];

function makeJourney(
  id: string,
  duration: { min: number; max: number },
  fare: { min: number; max: number },
): PublishedJourneySearchRecord {
  return {
    id,
    slug: id,
    title: "Provisional " + id,
    summary: "Provisional development search record.",
    estimatedDurationMin: duration.min,
    estimatedDurationMax: duration.max,
    estimatedFareMinCentavos: fare.min,
    estimatedFareMaxCentavos: fare.max,
    lastVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function makeTransitSegment({
  journeyId,
  position,
  boardingRouteStopId,
  alightingRouteStopId,
  durationMin = 10,
  durationMax = 15,
  fareMin = 1_500,
  fareMax = 2_000,
}: {
  journeyId: string;
  position: number;
  boardingRouteStopId: string;
  alightingRouteStopId: string;
  durationMin?: number;
  durationMax?: number;
  fareMin?: number;
  fareMax?: number;
}): PublishedJourneySearchSegment {
  return {
    journeyId,
    id: journeyId + "-segment-" + position,
    position,
    kind: "transit",
    walkingFromLocationId: null,
    walkingToLocationId: null,
    boardingRouteStopId,
    alightingRouteStopId,
    estimatedDurationMin: durationMin,
    estimatedDurationMax: durationMax,
    estimatedFareMinCentavos: fareMin,
    estimatedFareMaxCentavos: fareMax,
  };
}

test("ranks an authored direct journey before a one-transfer journey", () => {
  const direct = makeJourney(
    "direct",
    { min: 30, max: 40 },
    { min: 2_000, max: 2_500 },
  );
  const transferJourney = makeJourney(
    "one-transfer",
    { min: 20, max: 30 },
    { min: 3_000, max: 4_000 },
  );

  const results = assemblePublishedJourneySearchResults({
    origin,
    destination,
    journeys: [transferJourney, direct],
    segments: [
      makeTransitSegment({
        journeyId: direct.id,
        position: 1,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-destination",
        durationMin: 30,
        durationMax: 40,
        fareMin: 2_000,
        fareMax: 2_500,
      }),
      makeTransitSegment({
        journeyId: transferJourney.id,
        position: 1,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-transfer",
      }),
      makeTransitSegment({
        journeyId: transferJourney.id,
        position: 2,
        boardingRouteStopId: "route-two-transfer",
        alightingRouteStopId: "route-two-destination",
      }),
    ],
    routeStops,
    locations,
  });

  assert.deepEqual(
    results.map((result) => [result.slug, result.transferCount]),
    [
      ["direct", 0],
      ["one-transfer", 1],
    ],
  );
});

test("removes duplicate route combinations after deterministic ranking", () => {
  const faster = makeJourney(
    "faster",
    { min: 20, max: 25 },
    { min: 2_000, max: 2_500 },
  );
  const slower = makeJourney(
    "slower",
    { min: 30, max: 40 },
    { min: 2_000, max: 2_500 },
  );

  const results = assemblePublishedJourneySearchResults({
    origin,
    destination,
    journeys: [slower, faster],
    segments: [
      makeTransitSegment({
        journeyId: slower.id,
        position: 1,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-destination",
        durationMin: 30,
        durationMax: 40,
        fareMin: 2_000,
        fareMax: 2_500,
      }),
      makeTransitSegment({
        journeyId: faster.id,
        position: 1,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-destination",
        durationMin: 20,
        durationMax: 25,
        fareMin: 2_000,
        fareMax: 2_500,
      }),
    ],
    routeStops,
    locations,
  });

  assert.deepEqual(
    results.map((result) => result.slug),
    ["faster"],
  );
});

test("rejects a journey that revisits a location", () => {
  const loopJourney = makeJourney(
    "loop",
    { min: 12, max: 18 },
    { min: 1_500, max: 2_000 },
  );
  const loopStops: PublishedJourneySearchRouteStop[] = [
    ...routeStops,
    {
      id: "loop-transfer",
      transportRouteId: "loop-route",
      locationId: transfer.id,
      position: 1,
      canBoard: true,
      canAlight: true,
      routeIsActive: true,
    },
    {
      id: "loop-origin",
      transportRouteId: "loop-route",
      locationId: origin.id,
      position: 2,
      canBoard: true,
      canAlight: true,
      routeIsActive: true,
    },
  ];
  const segments: PublishedJourneySearchSegment[] = [
    {
      journeyId: loopJourney.id,
      id: "loop-walk-out",
      position: 1,
      kind: "walking",
      walkingFromLocationId: origin.id,
      walkingToLocationId: transfer.id,
      boardingRouteStopId: null,
      alightingRouteStopId: null,
      estimatedDurationMin: 1,
      estimatedDurationMax: 2,
      estimatedFareMinCentavos: null,
      estimatedFareMaxCentavos: null,
    },
    makeTransitSegment({
      journeyId: loopJourney.id,
      position: 2,
      boardingRouteStopId: "loop-transfer",
      alightingRouteStopId: "loop-origin",
      durationMin: 10,
      durationMax: 15,
    }),
    {
      journeyId: loopJourney.id,
      id: "loop-walk-destination",
      position: 3,
      kind: "walking",
      walkingFromLocationId: origin.id,
      walkingToLocationId: destination.id,
      boardingRouteStopId: null,
      alightingRouteStopId: null,
      estimatedDurationMin: 1,
      estimatedDurationMax: 1,
      estimatedFareMinCentavos: null,
      estimatedFareMaxCentavos: null,
    },
  ];

  const results = assemblePublishedJourneySearchResults({
    origin,
    destination,
    journeys: [loopJourney],
    segments,
    routeStops: loopStops,
    locations,
  });

  assert.deepEqual(results, []);
});

test("excludes journeys that use an inactive intermediate location", () => {
  const transferJourney = makeJourney(
    "inactive-transfer",
    { min: 20, max: 30 },
    { min: 3_000, max: 4_000 },
  );

  const results = assemblePublishedJourneySearchResults({
    origin,
    destination,
    journeys: [transferJourney],
    segments: [
      makeTransitSegment({
        journeyId: transferJourney.id,
        position: 1,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-transfer",
      }),
      makeTransitSegment({
        journeyId: transferJourney.id,
        position: 2,
        boardingRouteStopId: "route-two-transfer",
        alightingRouteStopId: "route-two-destination",
      }),
    ],
    routeStops,
    locations: locations.map((location) =>
      location.id === transfer.id ? { ...location, isActive: false } : location,
    ),
  });

  assert.deepEqual(results, []);
});

test("excludes journeys with more than one transfer", () => {
  const excessiveTransferJourney = makeJourney(
    "two-transfers",
    { min: 30, max: 45 },
    { min: 4_500, max: 6_000 },
  );

  const results = assemblePublishedJourneySearchResults({
    origin,
    destination,
    journeys: [excessiveTransferJourney],
    segments: [
      makeTransitSegment({
        journeyId: excessiveTransferJourney.id,
        position: 1,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-transfer",
      }),
      makeTransitSegment({
        journeyId: excessiveTransferJourney.id,
        position: 2,
        boardingRouteStopId: "route-two-transfer",
        alightingRouteStopId: "route-two-destination",
      }),
      makeTransitSegment({
        journeyId: excessiveTransferJourney.id,
        position: 3,
        boardingRouteStopId: "route-one-origin",
        alightingRouteStopId: "route-one-destination",
      }),
    ],
    routeStops,
    locations,
  });

  assert.deepEqual(results, []);
});
