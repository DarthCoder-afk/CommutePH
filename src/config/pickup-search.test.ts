import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPickupSearchRadiusMeters,
  resolvePickupSearchRadiusMeters,
} from "./pickup-search";

test("uses a configured pickup radius in meters", () => {
  assert.equal(resolvePickupSearchRadiusMeters("1500"), 1_500);
});

test("uses the default for missing or invalid pickup radii", () => {
  assert.equal(
    resolvePickupSearchRadiusMeters(undefined),
    defaultPickupSearchRadiusMeters,
  );
  assert.equal(
    resolvePickupSearchRadiusMeters("not-a-number"),
    defaultPickupSearchRadiusMeters,
  );
  assert.equal(
    resolvePickupSearchRadiusMeters("50"),
    defaultPickupSearchRadiusMeters,
  );
  assert.equal(
    resolvePickupSearchRadiusMeters("20000"),
    defaultPickupSearchRadiusMeters,
  );
});
