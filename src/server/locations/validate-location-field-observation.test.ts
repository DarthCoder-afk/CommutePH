import assert from "node:assert/strict";
import test from "node:test";

import { validateLocationFieldObservation } from "./validate-location-field-observation";

const currentTime = new Date("2026-08-09T10:00:00.000Z");
const confirmedInput = {
  locationSlug: "sample-stop",
  outcome: "confirmed",
  observedAt: "2026-08-09T08:30:00.000Z",
  observerLabel: "Field reviewer",
  notes: "The marked boarding point was observed in person.",
  observedName: "Sample Stop",
  observedKind: "stop",
  longitude: 121.01,
  latitude: 14.55,
  accuracyMeters: 12,
};

test("validates a complete confirmed field observation", () => {
  const result = validateLocationFieldObservation(confirmedInput, currentTime);

  assert.equal(result.locationSlug, "sample-stop");
  assert.equal(result.outcome, "confirmed");
  assert.equal(result.observedAt.toISOString(), confirmedInput.observedAt);
});

test("requires observed identity and coordinates for confirmation", () => {
  assert.throws(
    () =>
      validateLocationFieldObservation(
        {
          ...confirmedInput,
          observedName: undefined,
        },
        currentTime,
      ),
    /confirmed observation requires/,
  );
});

test("accepts a needs-follow-up observation without coordinates", () => {
  const result = validateLocationFieldObservation(
    {
      locationSlug: "sample-stop",
      outcome: "needs_follow_up",
      observedAt: "2026-08-09T08:30:00.000Z",
      observerLabel: "Field reviewer",
      notes: "The location could not be safely inspected from this side.",
    },
    currentTime,
  );

  assert.equal(result.longitude, null);
  assert.equal(result.outcome, "needs_follow_up");
});

test("rejects future observations and incomplete coordinate sets", () => {
  assert.throws(
    () =>
      validateLocationFieldObservation(
        { ...confirmedInput, observedAt: "2026-08-10T08:30:00.000Z" },
        currentTime,
      ),
    /cannot be in the future/,
  );
  assert.throws(
    () =>
      validateLocationFieldObservation(
        { ...confirmedInput, accuracyMeters: undefined },
        currentTime,
      ),
    /accuracyMeters must be/,
  );
});
