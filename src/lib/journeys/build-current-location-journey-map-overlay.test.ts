import assert from "node:assert/strict";
import test from "node:test";

import type { CurrentLocationJourneyOption } from "./build-current-location-journey-options";
import {
  buildCurrentLocationJourneyMapOverlay,
  type PublishedJourneyMap,
} from "./build-current-location-journey-map-overlay";

/* Development-only coordinates. They are not verified commuter guidance. */
const option: CurrentLocationJourneyOption = {
  id: "pickup:journey",
  rank: 1,
  isRecommended: true,
  pickup: {
    id: "pickup",
    slug: "provisional-pickup",
    name: "Provisional Pickup",
    city: "Test City",
    area: null,
    longitude: 121.01,
    latitude: 14.51,
  },
  initialWalkingSegment: {
    kind: "walking",
    summary: "Provisional initial walk.",
    estimatedDistanceMeters: 500,
    estimatedDuration: { minMinutes: 6, maxMinutes: 9 },
    verificationStatus: "estimated",
  },
  publishedJourney: {
    id: "journey",
    slug: "verified-test-journey",
    title: "Verified Test Journey",
    summary: "Verified test summary.",
    origin: { slug: "provisional-pickup", name: "Provisional Pickup" },
    destination: { slug: "destination", name: "Destination" },
    estimatedDuration: { minMinutes: 20, maxMinutes: 30 },
    estimatedFare: {
      minCentavos: 2_000,
      maxCentavos: 2_500,
      currency: "PHP",
    },
    transferCount: 0,
    verificationStatus: "verified",
    lastVerifiedAt: "2026-08-01T00:00:00.000Z",
  },
  estimatedTotalDuration: { minMinutes: 26, maxMinutes: 39 },
  estimatedFare: {
    minCentavos: 2_000,
    maxCentavos: 2_500,
    currency: "PHP",
  },
  totalWalkingDistance: {
    knownMeters: 500,
    coverage: "initial-segment-only",
  },
};

const publishedMap: PublishedJourneyMap = {
  markers: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "destination",
        geometry: { type: "Point", coordinates: [121.03, 14.53] },
        properties: {
          sequence: 2,
          slug: "destination",
          name: "Destination",
          roles: ["destination"],
          segmentPositions: [],
        },
      },
    ],
  },
  paths: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "transit-path",
        geometry: {
          type: "LineString",
          coordinates: [
            [121.01, 14.51],
            [121.03, 14.53],
          ],
        },
        properties: {
          segmentId: "transit-segment",
          segmentPosition: 1,
          kind: "transit",
          lastVerifiedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    ],
  },
};

test("adds an estimated browser-only walk before published map data", () => {
  const overlay = buildCurrentLocationJourneyMapOverlay({
    currentLocation: { longitude: 121, latitude: 14.5 },
    option,
    publishedMap,
  });

  assert.deepEqual(
    overlay.initialWalkingPath.features[0].geometry.coordinates,
    [
      [121, 14.5],
      [121.01, 14.51],
    ],
  );
  assert.equal(
    overlay.initialWalkingPath.features[0].properties.verificationStatus,
    "estimated",
  );
  assert.strictEqual(overlay.publishedMap, publishedMap);
  assert.deepEqual(overlay.boundsCoordinates.at(-1), [121.03, 14.53]);
});

test("rejects invalid pickup coordinates", () => {
  assert.throws(
    () =>
      buildCurrentLocationJourneyMapOverlay({
        currentLocation: { longitude: 121, latitude: 14.5 },
        option: {
          ...option,
          pickup: { ...option.pickup, longitude: Number.NaN },
        },
        publishedMap,
      }),
    /Pickup point.*invalid coordinates/,
  );
});
