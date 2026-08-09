import assert from "node:assert/strict";
import test from "node:test";

import {
  assessJourneyObservationApproval,
  type JourneyObservationApprovalRecord,
} from "./assess-journey-observation-approval";

const currentTime = new Date("2026-08-09T10:00:00.000Z");
const record = {
  journeyIsActive: false,
  observationOutcome: "confirmed",
  observationFinalizedAt: new Date("2026-08-09T09:00:00.000Z"),
  observedAt: new Date("2026-08-09T08:00:00.000Z"),
  actualDurationMinutes: 25,
  actualFareCentavos: 1500,
  actualTransferCount: 0,
  storedSegments: [
    { id: "walk", position: 1, kind: "walking" },
    { id: "ride", position: 2, kind: "transit" },
  ],
  observedSegments: [
    {
      journeySegmentId: "walk",
      position: 1,
      kind: "walking",
      actualDurationMinutes: 5,
      actualFareCentavos: null,
      pathEwkt: "SRID=4326;LINESTRING(121 14.5,121.01 14.51)",
      stepCount: 1,
    },
    {
      journeySegmentId: "ride",
      position: 2,
      kind: "transit",
      actualDurationMinutes: 20,
      actualFareCentavos: 1500,
      pathEwkt: "SRID=4326;LINESTRING(121.01 14.51,121.02 14.52)",
      stepCount: 2,
    },
  ],
  unapprovedLocationNames: [],
  unverifiedRouteNames: [],
  routesWithoutCurrentSchedule: [],
} satisfies JourneyObservationApprovalRecord;

test("approves complete current evidence with verified dependencies", () => {
  assert.deepEqual(assessJourneyObservationApproval(record, currentTime), {
    isApprovable: true,
    blockers: [],
  });
});

test("blocks missing dependency approvals", () => {
  const result = assessJourneyObservationApproval(
    {
      ...record,
      unapprovedLocationNames: ["First Stop"],
      unverifiedRouteNames: ["Sample Route"],
      routesWithoutCurrentSchedule: ["Sample Route"],
    },
    currentTime,
  );
  assert.equal(result.isApprovable, false);
  assert.ok(result.blockers.length >= 3);
});

test("blocks incomplete observed segments", () => {
  const result = assessJourneyObservationApproval(
    {
      ...record,
      observedSegments: [
        { ...record.observedSegments[0], pathEwkt: null, stepCount: 0 },
      ],
    },
    currentTime,
  );
  assert.equal(result.isApprovable, false);
  assert.ok(
    result.blockers.some((blocker) => blocker.includes("every stored")),
  );
});

test("blocks stale evidence and journeys above the transfer limit", () => {
  const result = assessJourneyObservationApproval(
    {
      ...record,
      observedAt: new Date("2026-01-01T00:00:00.000Z"),
      actualTransferCount: 2,
    },
    currentTime,
  );
  assert.equal(result.isApprovable, false);
  assert.ok(
    result.blockers.some((blocker) => blocker.includes("one transfer")),
  );
});
