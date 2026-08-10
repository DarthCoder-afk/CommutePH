import assert from "node:assert/strict";
import test from "node:test";

import { canExposeDevelopmentJourneyPreviews } from "./development-journey-preview-policy";

test("development previews are available only in development", () => {
  assert.equal(canExposeDevelopmentJourneyPreviews("development"), true);
  assert.equal(canExposeDevelopmentJourneyPreviews("production"), false);
  assert.equal(canExposeDevelopmentJourneyPreviews("test"), false);
  assert.equal(canExposeDevelopmentJourneyPreviews(undefined), false);
});
