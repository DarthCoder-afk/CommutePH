import assert from "node:assert/strict";
import test from "node:test";

import { assessDraftFixtureReplacement } from "./assess-draft-fixture-replacement";

const validRecord = {
  journeyStatus: "draft" as const,
  journeyIsActive: false,
  fixtureId: "fixture",
  fixtureSourceType: "development_fixture" as const,
  fixtureIsActive: false,
  replacementId: "osm-location",
  replacementSourceType: "openstreetmap" as const,
  replacementSourceExternalId: "node/123",
  replacementSourceUrl: "https://www.openstreetmap.org/node/123",
  distanceMeters: 16,
  walkingReferenceCount: 1,
  routeStopReferenceCount: 1,
  relatedRoutes: [
    {
      name: "Draft route",
      isActive: false,
      verificationStatus: "unverified" as const,
    },
  ],
  hasJourneyFieldEvidence: false,
  hasRouteFieldEvidence: false,
};

test("allows a nearby sourced replacement on an untouched draft", () => {
  assert.deepEqual(assessDraftFixtureReplacement(validRecord), {
    isAllowed: true,
    blockers: [],
  });
});

test("blocks another fixture or a distant sourced candidate", () => {
  const result = assessDraftFixtureReplacement({
    ...validRecord,
    replacementSourceType: "development_fixture",
    distanceMeters: 501,
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockers.length, 2);
});

test("blocks changes after journey or route field evidence exists", () => {
  const result = assessDraftFixtureReplacement({
    ...validRecord,
    hasJourneyFieldEvidence: true,
    hasRouteFieldEvidence: true,
  });

  assert.equal(result.isAllowed, false);
  assert.match(result.blockers.join(" "), /immutable field evidence/);
});

test("blocks active or verified production records", () => {
  const result = assessDraftFixtureReplacement({
    ...validRecord,
    journeyIsActive: true,
    relatedRoutes: [
      {
        name: "Published route",
        isActive: true,
        verificationStatus: "verified",
      },
    ],
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockers.length, 2);
});
