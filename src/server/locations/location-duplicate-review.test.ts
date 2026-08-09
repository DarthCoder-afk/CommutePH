import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeLocationPair,
  validateLocationDuplicateReviewDecision,
} from "./location-duplicate-review";

test("canonicalizes location pairs regardless of input order", () => {
  assert.deepEqual(canonicalizeLocationPair("z-location", "a-location"), {
    firstLocationId: "a-location",
    secondLocationId: "z-location",
  });
});

test("rejects a self-pair", () => {
  assert.throws(
    () => canonicalizeLocationPair("same-location", "same-location"),
    /against itself/,
  );
});

test("accepts a documented duplicate review decision", () => {
  assert.deepEqual(
    validateLocationDuplicateReviewDecision(
      "distinct",
      " Opposite boarding sides of the road. ",
    ),
    {
      status: "distinct",
      notes: "Opposite boarding sides of the road.",
    },
  );
});

test("rejects pending and undocumented decisions", () => {
  assert.throws(
    () => validateLocationDuplicateReviewDecision("pending", "long enough"),
    /Decision must be one of/,
  );
  assert.throws(
    () => validateLocationDuplicateReviewDecision("duplicate", "same"),
    /at least 10 characters/,
  );
});
