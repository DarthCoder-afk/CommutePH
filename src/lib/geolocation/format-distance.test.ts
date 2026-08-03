import assert from "node:assert/strict";
import test from "node:test";

import { formatApproximateDistance } from "./format-distance";

test("formats nearby distances in rounded meters", () => {
  assert.equal(formatApproximateDistance(347), "About 350 m away");
});

test("formats longer distances in kilometers", () => {
  assert.equal(formatApproximateDistance(1_540), "About 1.5 km away");
});

test("does not format invalid distances as real guidance", () => {
  assert.equal(formatApproximateDistance(Number.NaN), "Unknown distance");
  assert.equal(formatApproximateDistance(-1), "Unknown distance");
});
