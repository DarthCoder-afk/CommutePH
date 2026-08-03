import assert from "node:assert/strict";
import test from "node:test";

import {
  assemblePublishedJourneyPaths,
  type RawJourneySegmentPathRecord,
} from "./assemble-published-journey-paths";

/**
 * Development-only geometry fixtures.
 * These coordinates do not represent a verified real-world route.
 */
const PROVISIONAL_SEGMENTS: RawJourneySegmentPathRecord[] = [
  {
    id: "segment-development-two",
    position: 2,
    kind: "transit",
    pathGeoJson: JSON.stringify({
      type: "LineString",
      coordinates: [
        [121.02, 14.56],
        [121.03, 14.57],
      ],
    }),
    pathLastVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "segment-development-one",
    position: 1,
    kind: "walking",
    pathGeoJson: JSON.stringify({
      type: "LineString",
      coordinates: [
        [121, 14.54],
        [121.01, 14.55],
      ],
    }),
    pathLastVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const CURRENT_TIME = new Date("2026-01-02T00:00:00.000Z");

test("orders and assembles provisional path fixtures", () => {
  const result = assemblePublishedJourneyPaths(
    PROVISIONAL_SEGMENTS,
    CURRENT_TIME,
  );

  assert.deepEqual(
    result.features.map((feature) => feature.properties.segmentPosition),
    [1, 2],
  );

  assert.deepEqual(result.features[0]?.geometry.coordinates, [
    [121, 14.54],
    [121.01, 14.55],
  ]);
});

test("omits segments that have no path data", () => {
  const records = PROVISIONAL_SEGMENTS.map((record) =>
    record.position === 1
      ? {
          ...record,
          pathGeoJson: null,
          pathLastVerifiedAt: null,
        }
      : record,
  );

  const result = assemblePublishedJourneyPaths(records, CURRENT_TIME);

  assert.deepEqual(
    result.features.map((feature) => feature.properties.segmentPosition),
    [2],
  );
});

test("rejects a path without a verification date", () => {
  const records = PROVISIONAL_SEGMENTS.map((record) =>
    record.position === 1
      ? {
          ...record,
          pathLastVerifiedAt: null,
        }
      : record,
  );

  assert.throws(
    () => assemblePublishedJourneyPaths(records, CURRENT_TIME),
    /path and verification date must both be present/,
  );
});

test("rejects a future path verification date", () => {
  const records = PROVISIONAL_SEGMENTS.map((record) =>
    record.position === 1
      ? {
          ...record,
          pathLastVerifiedAt: new Date("2026-01-03T00:00:00.000Z"),
        }
      : record,
  );

  assert.throws(
    () => assemblePublishedJourneyPaths(records, CURRENT_TIME),
    /future verification date/,
  );
});

test("rejects a stale path verification date", () => {
  const records = PROVISIONAL_SEGMENTS.map((record) =>
    record.position === 1
      ? {
          ...record,
          pathLastVerifiedAt: new Date("2025-09-01T00:00:00.000Z"),
        }
      : record,
  );

  assert.throws(
    () => assemblePublishedJourneyPaths(records, CURRENT_TIME),
    /older than 90 days/,
  );
});

test("rejects invalid path coordinates", () => {
  const records = PROVISIONAL_SEGMENTS.map((record) =>
    record.position === 1
      ? {
          ...record,
          pathGeoJson: JSON.stringify({
            type: "LineString",
            coordinates: [
              [181, 14.54],
              [121.01, 14.55],
            ],
          }),
        }
      : record,
  );

  assert.throws(
    () => assemblePublishedJourneyPaths(records, CURRENT_TIME),
    /invalid longitude/,
  );
});

test("rejects non-gapless segment positions", () => {
  assert.throws(
    () =>
      assemblePublishedJourneyPaths(
        [
          {
            ...PROVISIONAL_SEGMENTS[1]!,
            position: 2,
          },
        ],
        CURRENT_TIME,
      ),
    /positions must be gapless/,
  );
});
