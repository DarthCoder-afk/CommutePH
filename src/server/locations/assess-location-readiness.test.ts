import assert from "node:assert/strict";
import test from "node:test";

import {
  assessLocationReadiness,
  type LocationReadinessRecord,
} from "./assess-location-readiness";

const currentTime = new Date("2026-08-09T00:00:00.000Z");
const readyLocation = {
  name: "Reviewed Transit Stop",
  slug: "reviewed-transit-stop",
  kind: "stop",
  city: "Makati",
  longitude: 121.02,
  latitude: 14.55,
  verificationStatus: "verified",
  lastVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
  sourceType: "openstreetmap",
  sourceExternalId: "node/123",
  sourceUrl: "https://www.openstreetmap.org/node/123",
  hasApprovedFieldVerification: true,
} satisfies LocationReadinessRecord;

test("passes a recently verified sourced location", () => {
  assert.deepEqual(assessLocationReadiness(readyLocation, currentTime), {
    isReady: true,
    blockers: [],
  });
});

test("blocks provisional imported locations", () => {
  const result = assessLocationReadiness(
    {
      ...readyLocation,
      verificationStatus: "unverified",
      lastVerifiedAt: null,
    },
    currentTime,
  );

  assert.equal(result.isReady, false);
  assert.ok(
    result.blockers.includes('Verification status must be "verified".'),
  );
  assert.ok(result.blockers.some((blocker) => blocker.includes("90 days")));
});

test("blocks development fixtures even when marked verified", () => {
  const result = assessLocationReadiness(
    {
      ...readyLocation,
      sourceType: "development_fixture",
      sourceExternalId: "fixture-1",
      sourceUrl: null,
    },
    currentTime,
  );

  assert.equal(result.isReady, false);
  assert.ok(
    result.blockers.includes(
      "Development fixture data cannot become publicly active.",
    ),
  );
});

test("requires stable provenance for external sources", () => {
  const result = assessLocationReadiness(
    {
      ...readyLocation,
      sourceExternalId: null,
      sourceUrl: "not-a-url",
      hasApprovedFieldVerification: false,
    },
    currentTime,
  );

  assert.equal(result.isReady, false);
  assert.ok(
    result.blockers.includes("The external source needs a stable identifier."),
  );
  assert.ok(
    result.blockers.includes(
      "The external source needs a valid HTTP source URL.",
    ),
  );
  assert.ok(
    result.blockers.includes(
      "The imported location needs an approved field-verification observation.",
    ),
  );
});
