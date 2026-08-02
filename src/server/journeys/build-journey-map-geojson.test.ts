import assert from "node:assert/strict";
import test from "node:test";

import type {
  AssembledJourneySegment,
  AssembledTransitSegment,
} from "./assemble-journey-segments";
import {
  buildJourneyMapGeoJson,
  type JourneyMapLocation,
} from "./build-journey-map-geojson";

/*
 * Development fixtures only.
 * These coordinates do not represent verified commuter locations.
 */
type ProvisionalSegmentLocation = JourneyMapLocation & {
  id: string;
};

const PROVISIONAL_ORIGIN: ProvisionalSegmentLocation = {
  id: "location-origin",
  slug: "provisional-origin",
  name: "Provisional Origin",
  longitude: 0,
  latitude: 0,
};

const PROVISIONAL_PICKUP: ProvisionalSegmentLocation = {
  id: "location-pickup",
  slug: "provisional-pickup",
  name: "Provisional Pickup",
  longitude: 1,
  latitude: 1,
};

const PROVISIONAL_TRANSFER: ProvisionalSegmentLocation = {
  id: "location-transfer",
  slug: "provisional-transfer",
  name: "Provisional Transfer",
  longitude: 2,
  latitude: 2,
};

const PROVISIONAL_DROPOFF: ProvisionalSegmentLocation = {
  id: "location-dropoff",
  slug: "provisional-dropoff",
  name: "Provisional Drop-off",
  longitude: 3,
  latitude: 3,
};

const PROVISIONAL_DESTINATION: ProvisionalSegmentLocation = {
  id: "location-destination",
  slug: "provisional-destination",
  name: "Provisional Destination",
  longitude: 4,
  latitude: 4,
};

function createWalkingSegment(
  id: string,
  position: number,
  from: ProvisionalSegmentLocation,
  to: ProvisionalSegmentLocation,
): AssembledJourneySegment {
  return {
    id,
    position,
    kind: "walking",
    summary: "Provisional walking segment.",
    from,
    to,
    estimatedDuration: null,
    estimatedFare: null,
    steps: [
      {
        id: `${id}-step`,
        position: 1,
        instruction: "Provisional walking instruction.",
      },
    ],
  };
}

function createTransitSegment(
  id: string,
  position: number,
  boardingLocation: ProvisionalSegmentLocation,
  alightingLocation: ProvisionalSegmentLocation,
): AssembledTransitSegment {
  return {
    id,
    position,
    kind: "transit",
    summary: "Provisional transit segment.",
    route: {
      id: `${id}-route`,
      slug: `${id}-provisional-route`,
      name: "Provisional Route",
      mode: "city_bus",
      operator: null,
      signboard: "PROVISIONAL",
    },
    boardingStop: {
      position: 1,
      location: boardingLocation,
      landmark: null,
      instructions: null,
    },
    alightingStop: {
      position: 2,
      location: alightingLocation,
      landmark: null,
      instructions: null,
    },
    estimatedDuration: null,
    estimatedFare: null,
    steps: [
      {
        id: `${id}-step`,
        position: 1,
        instruction: "Provisional transit instruction.",
      },
    ],
  };
}

test("builds ordered GeoJSON markers for a provisional direct journey", () => {
  const result = buildJourneyMapGeoJson({
    origin: PROVISIONAL_ORIGIN,
    destination: PROVISIONAL_DESTINATION,
    segments: [
      createWalkingSegment(
        "segment-one",
        1,
        PROVISIONAL_ORIGIN,
        PROVISIONAL_PICKUP,
      ),
      createTransitSegment(
        "segment-two",
        2,
        PROVISIONAL_PICKUP,
        PROVISIONAL_DROPOFF,
      ),
      createWalkingSegment(
        "segment-three",
        3,
        PROVISIONAL_DROPOFF,
        PROVISIONAL_DESTINATION,
      ),
    ],
  });

  assert.equal(result.type, "FeatureCollection");

  assert.deepEqual(
    result.features.map((feature) => feature.properties.roles),
    [["origin"], ["pickup"], ["dropoff"], ["destination"]],
  );

  const pickupMarker = result.features.find(
    (feature) => feature.id === "provisional-pickup",
  );

  assert(pickupMarker);

  assert.deepEqual(pickupMarker.geometry.coordinates, [1, 1]);
  assert.deepEqual(pickupMarker.properties.segmentPositions, [2]);
});

test("deduplicates a provisional transfer location", () => {
  const result = buildJourneyMapGeoJson({
    origin: PROVISIONAL_ORIGIN,
    destination: PROVISIONAL_DESTINATION,
    segments: [
      createTransitSegment(
        "segment-one",
        1,
        PROVISIONAL_ORIGIN,
        PROVISIONAL_TRANSFER,
      ),
      createTransitSegment(
        "segment-two",
        2,
        PROVISIONAL_TRANSFER,
        PROVISIONAL_DESTINATION,
      ),
    ],
  });

  assert.equal(result.features.length, 3);

  const transferMarker = result.features.find(
    (feature) => feature.id === "provisional-transfer",
  );

  assert(transferMarker);

  assert.deepEqual(transferMarker.properties.roles, ["transfer"]);
  assert.deepEqual(transferMarker.properties.segmentPositions, [1, 2]);
});

test("combines endpoint and transit roles at the same location", () => {
  const result = buildJourneyMapGeoJson({
    origin: PROVISIONAL_ORIGIN,
    destination: PROVISIONAL_DESTINATION,
    segments: [
      createTransitSegment(
        "segment-one",
        1,
        PROVISIONAL_ORIGIN,
        PROVISIONAL_DESTINATION,
      ),
    ],
  });

  assert.deepEqual(result.features[0]?.properties.roles, ["origin", "pickup"]);

  assert.deepEqual(result.features[1]?.properties.roles, [
    "dropoff",
    "destination",
  ]);
});

test("rejects conflicting provisional map data", () => {
  const conflictingOrigin = {
    ...PROVISIONAL_ORIGIN,
    longitude: 10,
  };

  assert.throws(
    () =>
      buildJourneyMapGeoJson({
        origin: conflictingOrigin,
        destination: PROVISIONAL_DESTINATION,
        segments: [
          createTransitSegment(
            "segment-one",
            1,
            PROVISIONAL_ORIGIN,
            PROVISIONAL_DESTINATION,
          ),
        ],
      }),
    /conflicting map data/,
  );
});
