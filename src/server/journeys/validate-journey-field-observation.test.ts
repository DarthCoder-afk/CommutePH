import assert from "node:assert/strict";
import test from "node:test";

import {
  lineStringToEwkt,
  validateJourneyFieldObservation,
} from "./validate-journey-field-observation";

const currentTime = new Date("2026-08-09T10:00:00.000Z");
const input = {
  journeySlug: "sample-journey",
  outcome: "confirmed",
  observedAt: "2026-08-09T08:00:00.000Z",
  observerLabel: "Field reviewer",
  notes: "The complete journey was travelled and recorded in person.",
  segments: [
    {
      position: 1,
      kind: "walking",
      actualDurationMinutes: 5,
      path: {
        type: "LineString",
        coordinates: [
          [121, 14.5],
          [121.001, 14.501],
        ],
      },
      steps: ["Walk to the boarding stop."],
    },
    {
      position: 2,
      kind: "transit",
      routeSlug: "sample-route",
      actualDurationMinutes: 20,
      actualFareCentavos: 1500,
      path: {
        type: "LineString",
        coordinates: [
          [121.001, 14.501],
          [121.02, 14.52],
        ],
      },
      steps: ["Board the signed vehicle.", "Alight at the destination stop."],
    },
  ],
};

test("validates and aggregates a complete journey field test", () => {
  const result = validateJourneyFieldObservation(input, currentTime);
  assert.equal(result.actualDurationMinutes, 25);
  assert.equal(result.actualFareCentavos, 1500);
  assert.equal(result.actualTransferCount, 0);
});

test("accepts an incomplete needs-follow-up observation", () => {
  const result = validateJourneyFieldObservation(
    {
      journeySlug: "sample-journey",
      outcome: "needs_follow_up",
      observedAt: "2026-08-09T08:00:00.000Z",
      observerLabel: "Field reviewer",
      notes: "The trip was cancelled before any segment could be observed.",
    },
    currentTime,
  );
  assert.equal(result.actualDurationMinutes, null);
  assert.deepEqual(result.segments, []);
});

test("rejects confirmed evidence with missing paths", () => {
  assert.throws(
    () =>
      validateJourneyFieldObservation(
        {
          ...input,
          segments: [{ ...input.segments[0], path: undefined }],
        },
        currentTime,
      ),
    /every ordered segment/,
  );
});

test("rejects fares on walking segments and missing transit fares", () => {
  assert.throws(
    () =>
      validateJourneyFieldObservation(
        {
          ...input,
          segments: [{ ...input.segments[0], actualFareCentavos: 100 }],
        },
        currentTime,
      ),
    /cannot have a route or fare/,
  );
  assert.throws(
    () =>
      validateJourneyFieldObservation(
        {
          ...input,
          segments: [
            {
              ...input.segments[1],
              actualFareCentavos: undefined,
              position: 1,
            },
          ],
        },
        currentTime,
      ),
    /needs a nonnegative fare/,
  );
});

test("converts validated coordinates to an SRID 4326 LineString", () => {
  assert.equal(
    lineStringToEwkt([
      [121, 14.5],
      [121.01, 14.51],
    ]),
    "SRID=4326;LINESTRING(121 14.5,121.01 14.51)",
  );
});
