import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleVerifiedDirectRoutes,
  type DirectRouteFareEvidenceRecord,
  type DirectRouteLocationRecord,
  type DirectRouteRecord,
  type DirectRouteStopRecord,
} from "./assemble-verified-direct-routes";

const CURRENT_TIME = new Date("2026-08-01T00:00:00.000Z");
const VERIFIED_AT = new Date("2026-07-15T00:00:00.000Z");
const ORIGIN = { id: "origin", slug: "origin", name: "Origin" };
const DESTINATION = {
  id: "destination",
  slug: "destination",
  name: "Destination",
};

const ROUTE: DirectRouteRecord = {
  id: "route-one",
  slug: "verified-direct-route",
  name: "Verified Direct Route",
  mode: "jeepney",
  operator: null,
  signboard: "Destination",
  verificationStatus: "verified",
  lastVerifiedAt: VERIFIED_AT,
  isActive: true,
};

const STOPS: DirectRouteStopRecord[] = [
  {
    id: "route-stop-origin",
    transportRouteId: ROUTE.id,
    locationId: ORIGIN.id,
    position: 1,
    canBoard: true,
    canAlight: false,
    pickupLandmark: "Verified waiting area",
    dropoffLandmark: null,
  },
  {
    id: "route-stop-middle",
    transportRouteId: ROUTE.id,
    locationId: "middle",
    position: 2,
    canBoard: true,
    canAlight: true,
    pickupLandmark: null,
    dropoffLandmark: null,
  },
  {
    id: "route-stop-destination",
    transportRouteId: ROUTE.id,
    locationId: DESTINATION.id,
    position: 3,
    canBoard: false,
    canAlight: true,
    pickupLandmark: null,
    dropoffLandmark: "Verified drop-off area",
  },
];

const LOCATIONS: DirectRouteLocationRecord[] = [
  ORIGIN,
  { id: "middle", slug: "middle", name: "Middle" },
  DESTINATION,
].map((location) => ({
  ...location,
  verificationStatus: "verified" as const,
  lastVerifiedAt: VERIFIED_AT,
  isActive: true,
}));

const SCHEDULES = [
  {
    id: "schedule-one",
    transportRouteId: ROUTE.id,
    position: 1,
    serviceDays: "Verified service days",
    operatingHours: "Verified operating hours",
    publicNotes: null,
    lastVerifiedAt: VERIFIED_AT,
    isActive: true,
  },
];

const FARE_EVIDENCE: DirectRouteFareEvidenceRecord[] = [
  {
    transportRouteId: ROUTE.id,
    outcome: "confirmed",
    observedAt: VERIFIED_AT,
    finalizedAt: VERIFIED_AT,
    fareMinCentavos: 1500,
    fareMaxCentavos: 2000,
    paymentMethod: "Cash",
    decision: "approved",
  },
];

function assemble(
  overrides: {
    routes?: DirectRouteRecord[];
    routeStops?: DirectRouteStopRecord[];
    locations?: DirectRouteLocationRecord[];
    fareEvidence?: DirectRouteFareEvidenceRecord[];
  } = {},
) {
  return assembleVerifiedDirectRoutes({
    origin: ORIGIN,
    destination: DESTINATION,
    routes: overrides.routes ?? [ROUTE],
    routeStops: overrides.routeStops ?? STOPS,
    locations: overrides.locations ?? LOCATIONS,
    schedules: SCHEDULES,
    fareEvidence: overrides.fareEvidence ?? FARE_EVIDENCE,
    currentTime: CURRENT_TIME,
  });
}

test("assembles a verified direct route in its allowed direction", () => {
  const [result] = assemble();

  assert.equal(result?.slug, ROUTE.slug);
  assert.equal(result?.origin.position, 1);
  assert.equal(result?.destination.position, 3);
  assert.deepEqual(result?.fare, {
    minCentavos: 1500,
    maxCentavos: 2000,
    currency: "PHP",
    paymentMethod: "Cash",
  });
  assert.equal(result?.schedules.length, 1);
});

test("rejects reverse travel and inaccessible boarding", () => {
  assert.deepEqual(
    assembleVerifiedDirectRoutes({
      origin: DESTINATION,
      destination: ORIGIN,
      routes: [ROUTE],
      routeStops: STOPS,
      locations: LOCATIONS,
      schedules: SCHEDULES,
      fareEvidence: FARE_EVIDENCE,
      currentTime: CURRENT_TIME,
    }),
    [],
  );

  assert.deepEqual(
    assemble({
      routeStops: STOPS.map((stop) =>
        stop.id === "route-stop-origin" ? { ...stop, canBoard: false } : stop,
      ),
    }),
    [],
  );
});

test("excludes routes with unverified stops or stale route evidence", () => {
  assert.deepEqual(
    assemble({
      locations: LOCATIONS.map((location) =>
        location.id === "middle"
          ? { ...location, verificationStatus: "unverified" }
          : location,
      ),
    }),
    [],
  );

  assert.deepEqual(
    assemble({
      routes: [
        {
          ...ROUTE,
          lastVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    }),
    [],
  );
});

test("requires approved matching fare evidence", () => {
  assert.deepEqual(
    assemble({
      fareEvidence: [
        {
          ...FARE_EVIDENCE[0]!,
          decision: "needs_follow_up",
        },
      ],
    }),
    [],
  );
});

test("rejects malformed verified route stop ordering", () => {
  assert.throws(
    () =>
      assemble({
        routeStops: STOPS.map((stop) =>
          stop.position === 2 ? { ...stop, position: 4 } : stop,
        ),
      }),
    /non-gapless stop sequence/,
  );
});
