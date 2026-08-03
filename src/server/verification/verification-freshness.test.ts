import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicVerificationCutoff,
  isPublicVerificationCurrent,
} from "./verification-freshness";

const currentTime = new Date("2026-08-03T00:00:00.000Z");

test("accepts verification within the public validity period", () => {
  assert.equal(
    isPublicVerificationCurrent(
      new Date("2026-07-01T00:00:00.000Z"),
      currentTime,
    ),
    true,
  );
});

test("accepts verification exactly at the cutoff", () => {
  const cutoff = getPublicVerificationCutoff(currentTime);

  assert.equal(isPublicVerificationCurrent(cutoff, currentTime), true);
});

test("rejects verification older than the cutoff", () => {
  const cutoff = getPublicVerificationCutoff(currentTime);
  const olderThanCutoff = new Date(cutoff.getTime() - 1);

  assert.equal(
    isPublicVerificationCurrent(olderThanCutoff, currentTime),
    false,
  );
});

test("rejects future verification dates", () => {
  assert.equal(
    isPublicVerificationCurrent(
      new Date("2026-08-04T00:00:00.000Z"),
      currentTime,
    ),
    false,
  );
});

test("rejects missing or invalid verification dates", () => {
  assert.equal(isPublicVerificationCurrent(null, currentTime), false);

  assert.equal(
    isPublicVerificationCurrent(new Date("invalid"), currentTime),
    false,
  );
});
