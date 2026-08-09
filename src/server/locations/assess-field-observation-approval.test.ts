import assert from "node:assert/strict";
import test from "node:test";

import {
  assessFieldObservationApproval,
  type FieldObservationApprovalRecord,
} from "./assess-field-observation-approval";

const currentTime = new Date("2026-08-09T10:00:00.000Z");
const approvableRecord = {
  locationName: "Alabang Jeepney Terminal",
  locationKind: "terminal",
  locationLongitude: 121.047,
  locationLatitude: 14.417,
  sourceType: "openstreetmap",
  locationIsActive: false,
  observationOutcome: "confirmed",
  observedAt: new Date("2026-08-09T08:00:00.000Z"),
  observedName: "Alabang Jeepney Terminal",
  observedKind: "terminal",
  observedLongitude: 121.04705,
  observedLatitude: 14.417,
  accuracyMeters: 15,
  hasPendingDuplicateReview: false,
} satisfies FieldObservationApprovalRecord;

test("allows a current matching confirmed observation", () => {
  const result = assessFieldObservationApproval(approvableRecord, currentTime);

  assert.equal(result.isApprovable, true);
  assert.deepEqual(result.blockers, []);
});

test("blocks unresolved duplicate reviews", () => {
  const result = assessFieldObservationApproval(
    { ...approvableRecord, hasPendingDuplicateReview: true },
    currentTime,
  );

  assert.equal(result.isApprovable, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("duplicate")));
});

test("blocks stale, mismatched, or inaccurate observations", () => {
  const result = assessFieldObservationApproval(
    {
      ...approvableRecord,
      observedAt: new Date("2026-01-01T00:00:00.000Z"),
      observedName: "Different Stop",
      observedKind: "stop",
      accuracyMeters: 150,
    },
    currentTime,
  );

  assert.equal(result.isApprovable, false);
  assert.ok(result.blockers.length >= 4);
});

test("blocks coordinate differences beyond the GPS tolerance", () => {
  const result = assessFieldObservationApproval(
    { ...approvableRecord, observedLongitude: 121.05 },
    currentTime,
  );

  assert.equal(result.isApprovable, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("coordinates")));
});
