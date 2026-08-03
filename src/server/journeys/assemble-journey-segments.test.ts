import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleJourneySegments,
  type RawJourneySegmentRecord,
  type RawJourneyStepRecord,
  type SegmentLocationRecord,
  type SegmentRouteRecord,
  type SegmentRouteStopRecord,
} from "./assemble-journey-segments";

/*
 * Development fixtures only.
 * These records do not describe verified commuter guidance.
 */
const PROVISIONAL_LOCATIONS: SegmentLocationRecord[] = [
  {
    id: "location-origin",
    slug: "provisional-origin",
    name: "Provisional Origin",
    longitude: 0,
    latitude: 0,
  },
  {
    id: "location-terminal",
    slug: "provisional-terminal",
    name: "Provisional Terminal",
    longitude: 1,
    latitude: 1,
  },
  {
    id: "location-stop",
    slug: "provisional-stop",
    name: "Provisional Stop",
    longitude: 2,
    latitude: 2,
  },
  {
    id: "location-destination",
    slug: "provisional-destination",
    name: "Provisional Destination",
    longitude: 3,
    latitude: 3,
  },
];

const PROVISIONAL_ROUTES: SegmentRouteRecord[] = [
  {
    id: "route-development",
    slug: "provisional-development-route",
    name: "Provisional Development Route",
    mode: "city_bus",
    operator: null,
    signboard: "PROVISIONAL",
  },
];

const PROVISIONAL_ROUTE_STOPS: SegmentRouteStopRecord[] = [
  {
    id: "stop-boarding",
    transportRouteId: "route-development",
    locationId: "location-terminal",
    position: 1,
    canBoard: true,
    canAlight: false,
    pickupLandmark: "Provisional pickup landmark",
    dropoffLandmark: null,
    pickupInstructions: "Provisional boarding instructions.",
    dropoffInstructions: null,
  },
  {
    id: "stop-alighting",
    transportRouteId: "route-development",
    locationId: "location-stop",
    position: 2,
    canBoard: true,
    canAlight: true,
    pickupLandmark: null,
    dropoffLandmark: "Provisional drop-off landmark",
    pickupInstructions: null,
    dropoffInstructions: "Provisional alighting instructions.",
  },
];

const PROVISIONAL_SEGMENTS: RawJourneySegmentRecord[] = [
  {
    id: "segment-three",
    position: 3,
    kind: "walking",
    summary: "Provisional final walking segment.",
    publicNotes: null,
    walkingFromLocationId: "location-stop",
    walkingToLocationId: "location-destination",
    boardingRouteStopId: null,
    alightingRouteStopId: null,
    estimatedDurationMin: null,
    estimatedDurationMax: null,
    estimatedFareMinCentavos: null,
    estimatedFareMaxCentavos: null,
  },
  {
    id: "segment-one",
    position: 1,
    kind: "walking",
    summary: "Provisional initial walking segment.",
    publicNotes: null,
    walkingFromLocationId: "location-origin",
    walkingToLocationId: "location-terminal",
    boardingRouteStopId: null,
    alightingRouteStopId: null,
    estimatedDurationMin: null,
    estimatedDurationMax: null,
    estimatedFareMinCentavos: null,
    estimatedFareMaxCentavos: null,
  },
  {
    id: "segment-two",
    position: 2,
    kind: "transit",
    summary: "Provisional transit segment.",
    publicNotes: "Provisional public warning.",
    walkingFromLocationId: null,
    walkingToLocationId: null,
    boardingRouteStopId: "stop-boarding",
    alightingRouteStopId: "stop-alighting",
    estimatedDurationMin: null,
    estimatedDurationMax: null,
    estimatedFareMinCentavos: null,
    estimatedFareMaxCentavos: null,
  },
];

const PROVISIONAL_STEPS: RawJourneyStepRecord[] = [
  {
    id: "step-one-two",
    journeySegmentId: "segment-one",
    position: 2,
    instruction: "Provisional second instruction.",
  },
  {
    id: "step-one-one",
    journeySegmentId: "segment-one",
    position: 1,
    instruction: "Provisional first instruction.",
  },
  {
    id: "step-two-one",
    journeySegmentId: "segment-two",
    position: 1,
    instruction: "Provisional transit instruction.",
  },
  {
    id: "step-three-one",
    journeySegmentId: "segment-three",
    position: 1,
    instruction: "Provisional final instruction.",
  },
];

test("assembles ordered provisional walking and transit segments", () => {
  const result = assembleJourneySegments({
    segments: PROVISIONAL_SEGMENTS,
    steps: PROVISIONAL_STEPS,
    locations: PROVISIONAL_LOCATIONS,
    routes: PROVISIONAL_ROUTES,
    routeStops: PROVISIONAL_ROUTE_STOPS,
  });

  assert.deepEqual(
    result.map((segment) => segment.position),
    [1, 2, 3],
  );

  const firstSegment = result[0];
  const transitSegment = result[1];

  assert(firstSegment);
  assert(transitSegment);

  assert.equal(firstSegment.kind, "walking");

  assert.equal(firstSegment.from.longitude, 0);
  assert.equal(firstSegment.from.latitude, 0);
  assert.equal(firstSegment.to.longitude, 1);
  assert.equal(firstSegment.to.latitude, 1);

  if (firstSegment.kind === "walking") {
    assert.equal(firstSegment.from.name, "Provisional Origin");
    assert.equal(firstSegment.to.name, "Provisional Terminal");

    assert.deepEqual(
      firstSegment.steps.map((step) => step.position),
      [1, 2],
    );
  }

  assert.equal(transitSegment.kind, "transit");

  if (transitSegment.kind === "transit") {
    assert.equal(transitSegment.route.name, "Provisional Development Route");

    assert.equal(
      transitSegment.boardingStop.location.name,
      "Provisional Terminal",
    );

    assert.equal(
      transitSegment.alightingStop.location.name,
      "Provisional Stop",
    );
  }

  assert.equal(transitSegment.publicNotes, "Provisional public warning.");
});

test("rejects a missing walking location", () => {
  assert.throws(
    () =>
      assembleJourneySegments({
        segments: PROVISIONAL_SEGMENTS,
        steps: PROVISIONAL_STEPS,
        locations: PROVISIONAL_LOCATIONS.filter(
          (location) => location.id !== "location-destination",
        ),
        routes: PROVISIONAL_ROUTES,
        routeStops: PROVISIONAL_ROUTE_STOPS,
      }),
    /ending location "location-destination" was not found/,
  );
});

test("rejects transit stops from different routes", () => {
  const invalidStops = PROVISIONAL_ROUTE_STOPS.map((routeStop) =>
    routeStop.id === "stop-alighting"
      ? {
          ...routeStop,
          transportRouteId: "another-route",
        }
      : routeStop,
  );

  assert.throws(
    () =>
      assembleJourneySegments({
        segments: PROVISIONAL_SEGMENTS,
        steps: PROVISIONAL_STEPS,
        locations: PROVISIONAL_LOCATIONS,
        routes: PROVISIONAL_ROUTES,
        routeStops: invalidStops,
      }),
    /uses stops from different routes/,
  );
});

test("rejects non-gapless segment positions", () => {
  const invalidSegments = PROVISIONAL_SEGMENTS.filter(
    (segment) => segment.position !== 2,
  );

  assert.throws(
    () =>
      assembleJourneySegments({
        segments: invalidSegments,
        steps: PROVISIONAL_STEPS,
        locations: PROVISIONAL_LOCATIONS,
        routes: PROVISIONAL_ROUTES,
        routeStops: PROVISIONAL_ROUTE_STOPS,
      }),
    /Expected 2, received 3/,
  );
});

test("rejects invalid provisional location coordinates", () => {
  const invalidLocations = PROVISIONAL_LOCATIONS.map((location) =>
    location.id === "location-origin"
      ? {
          ...location,
          longitude: 181,
        }
      : location,
  );

  assert.throws(
    () =>
      assembleJourneySegments({
        segments: PROVISIONAL_SEGMENTS,
        steps: PROVISIONAL_STEPS,
        locations: invalidLocations,
        routes: PROVISIONAL_ROUTES,
        routeStops: PROVISIONAL_ROUTE_STOPS,
      }),
    /invalid coordinates/,
  );
});

test("rejects blank provisional public notes", () => {
  const invalidSegments = PROVISIONAL_SEGMENTS.map((segment) =>
    segment.id === "segment-two"
      ? {
          ...segment,
          publicNotes: "   ",
        }
      : segment,
  );

  assert.throws(
    () =>
      assembleJourneySegments({
        segments: invalidSegments,
        steps: PROVISIONAL_STEPS,
        locations: PROVISIONAL_LOCATIONS,
        routes: PROVISIONAL_ROUTES,
        routeStops: PROVISIONAL_ROUTE_STOPS,
      }),
    /public notes cannot be blank/,
  );
});
