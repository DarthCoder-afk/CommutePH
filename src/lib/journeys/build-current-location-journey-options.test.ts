import assert from "node:assert/strict";
import test from "node:test";

import type { JourneySummary } from "./journey-summary";
import { buildCurrentLocationJourneyOptions } from "./build-current-location-journey-options";

function makeJourney(
  id: string,
  duration: { minMinutes: number; maxMinutes: number },
  fareMinCentavos: number,
): JourneySummary {
  return {
    id,
    slug: id,
    title: `Journey ${id}`,
    summary: "Verified development test journey.",
    origin: { slug: `origin-${id}`, name: `Origin ${id}` },
    destination: { slug: "destination", name: "Destination" },
    estimatedDuration: duration,
    estimatedFare: {
      minCentavos: fareMinCentavos,
      maxCentavos: fareMinCentavos + 500,
      currency: "PHP",
    },
    transferCount: 0,
    verificationStatus: "verified",
    lastVerifiedAt: "2026-01-01T00:00:00.000Z",
  };
}

const nearPickup = {
  location: {
    id: "near",
    slug: "near-pickup",
    name: "Near Pickup",
    city: "Test City",
    area: null,
  },
  distanceMeters: 400,
};

const farPickup = {
  location: {
    id: "far",
    slug: "far-pickup",
    name: "Far Pickup",
    city: "Test City",
    area: "Test Area",
  },
  distanceMeters: 1_200,
};

test("adds an estimated initial walk to the verified journey duration", () => {
  const [option] = buildCurrentLocationJourneyOptions([
    {
      candidate: nearPickup,
      journeys: [makeJourney("one", { minMinutes: 20, maxMinutes: 30 }, 2_000)],
    },
  ]);

  assert.ok(option);
  assert.deepEqual(option.initialWalkingSegment.estimatedDuration, {
    minMinutes: 6,
    maxMinutes: 9,
  });
  assert.deepEqual(option.estimatedTotalDuration, {
    minMinutes: 26,
    maxMinutes: 39,
  });
  assert.equal(option.estimatedFare.minCentavos, 2_000);
  assert.equal(option.totalWalkingDistance.coverage, "initial-segment-only");
});

test("ranks complete options by total duration before fare and walking distance", () => {
  const options = buildCurrentLocationJourneyOptions([
    {
      candidate: nearPickup,
      journeys: [
        makeJourney("slow", { minMinutes: 30, maxMinutes: 40 }, 1_500),
      ],
    },
    {
      candidate: farPickup,
      journeys: [
        makeJourney("fast", { minMinutes: 10, maxMinutes: 15 }, 3_000),
      ],
    },
  ]);

  assert.deepEqual(
    options.map((option) => option.publishedJourney.id),
    ["fast", "slow"],
  );
  assert.equal(options[0]?.isRecommended, true);
  assert.equal(options[0]?.rank, 1);
  assert.equal(options[1]?.isRecommended, false);
});

test("rejects invalid pickup distances", () => {
  assert.throws(
    () =>
      buildCurrentLocationJourneyOptions([
        {
          candidate: { ...nearPickup, distanceMeters: Number.NaN },
          journeys: [
            makeJourney("invalid", { minMinutes: 10, maxMinutes: 15 }, 1_000),
          ],
        },
      ]),
    /invalid distance/,
  );
});
