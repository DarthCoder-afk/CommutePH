import assert from "node:assert/strict";
import test from "node:test";

import {
  getGeolocationFailureStatus,
  isGeolocationFailure,
} from "./geolocation-status";

test("maps browser geolocation errors to understandable states", () => {
  assert.equal(getGeolocationFailureStatus(1), "permission-denied");
  assert.equal(getGeolocationFailureStatus(2), "position-unavailable");
  assert.equal(getGeolocationFailureStatus(3), "timeout");
  assert.equal(getGeolocationFailureStatus(999), "position-unavailable");
});

test("distinguishes geolocation failures from progress and success", () => {
  assert.equal(isGeolocationFailure("permission-denied"), true);
  assert.equal(isGeolocationFailure("unsupported"), true);
  assert.equal(isGeolocationFailure("position-unavailable"), true);
  assert.equal(isGeolocationFailure("timeout"), true);
  assert.equal(isGeolocationFailure("idle"), false);
  assert.equal(isGeolocationFailure("requesting"), false);
  assert.equal(isGeolocationFailure("success"), false);
});
