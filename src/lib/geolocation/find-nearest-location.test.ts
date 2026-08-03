import assert from "node:assert/strict";
import test from "node:test";

import { findNearestLocation } from "./find-nearest-location";

const locations = [
  {
    id: "one-ayala",
    longitude: 121.0234,
    latitude: 14.5507,
  },
  {
    id: "bgc-high-street",
    longitude: 121.0509,
    latitude: 14.5508,
  },
];

test("returns the supported location nearest to the supplied position", () => {
  const nearest = findNearestLocation(
    { longitude: 121.024, latitude: 14.551 },
    locations,
  );

  assert.equal(nearest?.id, "one-ayala");
});

test("returns null when no valid candidates are available", () => {
  assert.equal(
    findNearestLocation({ longitude: 121.024, latitude: 14.551 }, [
      { id: "invalid", longitude: Number.NaN, latitude: 14.5 },
    ]),
    null,
  );
});

test("returns null for an invalid supplied position", () => {
  assert.equal(
    findNearestLocation({ longitude: 181, latitude: 14.551 }, locations),
    null,
  );
});
