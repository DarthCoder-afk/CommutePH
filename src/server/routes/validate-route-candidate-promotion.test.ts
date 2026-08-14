import assert from "node:assert/strict";
import test from "node:test";

import { validateRouteCandidatePromotion } from "./validate-route-candidate-promotion";

const validInput = {
  sourceType: "openstreetmap",
  sourceExternalId: "relation/123",
  slug: "reviewed-sample-route",
  name: "Reviewed Sample Route",
  mode: "city_bus",
  operator: null,
  signboard: "Sample destination",
  description: "Inactive draft prepared from a reviewed mapped candidate.",
  stops: [
    {
      candidatePosition: 2,
      canBoard: true,
      canAlight: false,
      pickupLandmark: "Reviewed pickup landmark",
      dropoffLandmark: null,
    },
    {
      candidatePosition: 5,
      canBoard: false,
      canAlight: true,
      pickupLandmark: null,
      dropoffLandmark: "Reviewed drop-off landmark",
    },
  ],
  schedule: {
    serviceDays: "Needs field verification",
    operatingHours: "Needs field verification",
    publicNotes: null,
  },
  promotedBy: "Reviewer",
  notes: "Reviewed only as draft structure; current operation is unverified.",
  evidenceUrl: "https://www.openstreetmap.org/relation/123",
};

test("validates an explicit draft route promotion", () => {
  const result = validateRouteCandidatePromotion(validInput);

  assert.equal(result.mode, "city_bus");
  assert.deepEqual(
    result.stops.map((stop) => stop.candidatePosition),
    [2, 5],
  );
});

test("requires reviewed stop access and an increasing selection", () => {
  assert.throws(
    () =>
      validateRouteCandidatePromotion({
        ...validInput,
        stops: [validInput.stops[1], validInput.stops[0]],
      }),
    /positions must be increasing/,
  );
  assert.throws(
    () =>
      validateRouteCandidatePromotion({
        ...validInput,
        stops: [
          { ...validInput.stops[0], canBoard: false, canAlight: false },
          validInput.stops[1],
        ],
      }),
    /must allow boarding or alighting/,
  );
});

test("rejects unsupported modes and weak audit notes", () => {
  assert.throws(
    () => validateRouteCandidatePromotion({ ...validInput, mode: "train" }),
    /mode must be one of/,
  );
  assert.throws(
    () => validateRouteCandidatePromotion({ ...validInput, notes: "Short" }),
    /notes must contain at least 20 characters/,
  );
});
