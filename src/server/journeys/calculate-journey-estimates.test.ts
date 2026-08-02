import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateJourneyEstimates,
  type JourneyEstimateSegment,
} from "./calculate-journey-estimates";

/*
 * Development fixtures only.
 * These values are provisional and do not represent verified commuter data.
 */
const PROVISIONAL_DIRECT_JOURNEY: JourneyEstimateSegment[] = [
  {
    id: "provisional-walk-to-terminal",
    position: 1,
    kind: "walking",
    estimatedDurationMin: 5,
    estimatedDurationMax: 10,
    estimatedFareMinCentavos: null,
    estimatedFareMaxCentavos: null,
  },
  {
    id: "provisional-transit-segment",
    position: 2,
    kind: "transit",
    estimatedDurationMin: 20,
    estimatedDurationMax: 35,
    estimatedFareMinCentavos: 1500,
    estimatedFareMaxCentavos: 1500,
  },
  {
    id: "provisional-walk-to-destination",
    position: 3,
    kind: "walking",
    estimatedDurationMin: 5,
    estimatedDurationMax: 10,
    estimatedFareMinCentavos: null,
    estimatedFareMaxCentavos: null,
  },
];

test("orders provisional segments and aggregates their estimates", () => {
  const unorderedFixture = [
    PROVISIONAL_DIRECT_JOURNEY[2],
    PROVISIONAL_DIRECT_JOURNEY[0],
    PROVISIONAL_DIRECT_JOURNEY[1],
  ].filter(
    (segment): segment is JourneyEstimateSegment => segment !== undefined,
  );

  const result = calculateJourneyEstimates(unorderedFixture);

  assert.deepEqual(
    result.orderedSegments.map((segment) => segment.position),
    [1, 2, 3],
  );

  assert.deepEqual(result.estimatedDuration, {
    minMinutes: 30,
    maxMinutes: 55,
  });

  assert.deepEqual(result.estimatedFare, {
    minCentavos: 1500,
    maxCentavos: 1500,
    currency: "PHP",
  });

  assert.equal(result.transferCount, 0);
});

test("adds provisional transit fares and counts one transfer", () => {
  const provisionalTransferFixture: JourneyEstimateSegment[] = [
    {
      id: "provisional-transit-one",
      position: 1,
      kind: "transit",
      estimatedDurationMin: 10,
      estimatedDurationMax: 20,
      estimatedFareMinCentavos: 1500,
      estimatedFareMaxCentavos: 1500,
    },
    {
      id: "provisional-transit-two",
      position: 2,
      kind: "transit",
      estimatedDurationMin: 15,
      estimatedDurationMax: 25,
      estimatedFareMinCentavos: 1300,
      estimatedFareMaxCentavos: 1500,
    },
  ];

  const result = calculateJourneyEstimates(provisionalTransferFixture);

  assert.deepEqual(result.estimatedDuration, {
    minMinutes: 25,
    maxMinutes: 45,
  });

  assert.deepEqual(result.estimatedFare, {
    minCentavos: 2800,
    maxCentavos: 3000,
    currency: "PHP",
  });

  assert.equal(result.transferCount, 1);
});

test("rejects a provisional transit segment without a fare", () => {
  const fixture: JourneyEstimateSegment[] = [
    {
      id: "provisional-transit-missing-fare",
      position: 1,
      kind: "transit",
      estimatedDurationMin: 10,
      estimatedDurationMax: 20,
      estimatedFareMinCentavos: null,
      estimatedFareMaxCentavos: null,
    },
  ];

  assert.throws(
    () => calculateJourneyEstimates(fixture),
    /Transit segment 1 fare must have a complete range/,
  );
});

test("rejects non-gapless segment positions", () => {
  const fixture: JourneyEstimateSegment[] = [
    {
      id: "provisional-segment-one",
      position: 1,
      kind: "walking",
      estimatedDurationMin: 5,
      estimatedDurationMax: 10,
      estimatedFareMinCentavos: null,
      estimatedFareMaxCentavos: null,
    },
    {
      id: "provisional-segment-three",
      position: 3,
      kind: "walking",
      estimatedDurationMin: 5,
      estimatedDurationMax: 10,
      estimatedFareMinCentavos: null,
      estimatedFareMaxCentavos: null,
    },
  ];

  assert.throws(
    () => calculateJourneyEstimates(fixture),
    /Expected 2, received 3/,
  );
});

test("rejects fares on walking segments", () => {
  const fixture: JourneyEstimateSegment[] = [
    {
      id: "provisional-paid-walking-segment",
      position: 1,
      kind: "walking",
      estimatedDurationMin: 5,
      estimatedDurationMax: 10,
      estimatedFareMinCentavos: 100,
      estimatedFareMaxCentavos: 100,
    },
  ];

  assert.throws(
    () => calculateJourneyEstimates(fixture),
    /Walking segment 1 must not have a fare/,
  );
});
