import assert from "node:assert/strict";
import test from "node:test";

import {
  assessRouteObservationApproval,
  type RouteObservationApprovalRecord,
} from "./assess-route-observation-approval";

const currentTime = new Date("2026-08-09T10:00:00.000Z");
const record = {
  routeName: "Sample Route",
  routeMode: "city_bus",
  routeOperator: "Sample Operator",
  routeSignboard: "SAMPLE",
  routeIsActive: false,
  observationOutcome: "confirmed",
  observationFinalizedAt: new Date("2026-08-09T08:10:00.000Z"),
  observedAt: new Date("2026-08-09T08:00:00.000Z"),
  observedName: "Sample Route",
  observedMode: "city_bus",
  observedOperator: "Sample Operator",
  observedSignboard: "SAMPLE",
  observedServiceDays: "Monday to Friday",
  observedOperatingHours: "06:00-22:00",
  observedStops: [
    { position: 1, locationId: "first", canBoard: true, canAlight: false },
    { position: 2, locationId: "second", canBoard: false, canAlight: true },
  ],
  storedStops: [
    {
      position: 1,
      locationId: "first",
      canBoard: true,
      canAlight: false,
      locationVerificationStatus: "verified",
    },
    {
      position: 2,
      locationId: "second",
      canBoard: false,
      canAlight: true,
      locationVerificationStatus: "verified",
    },
  ],
  storedSchedules: [
    {
      id: "schedule-one",
      serviceDays: "Monday to Friday",
      operatingHours: "06:00-22:00",
      isActive: false,
    },
  ],
} satisfies RouteObservationApprovalRecord;

test("approves current evidence matching an inactive stored route", () => {
  const result = assessRouteObservationApproval(record, currentTime);
  assert.equal(result.isApprovable, true);
  assert.equal(result.matchingScheduleId, "schedule-one");
});

test("blocks unverified route-stop locations", () => {
  const result = assessRouteObservationApproval(
    {
      ...record,
      storedStops: record.storedStops.map((stop, index) =>
        index === 0
          ? { ...stop, locationVerificationStatus: "unverified" }
          : stop,
      ),
    },
    currentTime,
  );
  assert.equal(result.isApprovable, false);
  assert.ok(
    result.blockers.some((blocker) => blocker.includes("must be verified")),
  );
});

test("blocks mismatched stops and schedules", () => {
  const result = assessRouteObservationApproval(
    {
      ...record,
      observedStops: [
        record.observedStops[0],
        { ...record.observedStops[1], locationId: "different" },
      ],
      observedOperatingHours: "Unknown",
    },
    currentTime,
  );
  assert.equal(result.isApprovable, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("stop 2")));
  assert.ok(result.blockers.some((blocker) => blocker.includes("schedule")));
});

test("blocks stale or incomplete evidence", () => {
  const result = assessRouteObservationApproval(
    {
      ...record,
      observationFinalizedAt: null,
      observedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    currentTime,
  );
  assert.equal(result.isApprovable, false);
  assert.ok(result.blockers.length >= 2);
});
