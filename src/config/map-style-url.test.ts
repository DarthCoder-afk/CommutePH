import assert from "node:assert/strict";
import test from "node:test";

import { developmentMapStyleUrl, resolveMapStyleUrl } from "./map-style-url";

test("uses the configured public map style URL", () => {
  assert.equal(
    resolveMapStyleUrl(" https://maps.example.test/style.json ", "production"),
    "https://maps.example.test/style.json",
  );
});

test("uses demo tiles only during development", () => {
  assert.equal(
    resolveMapStyleUrl(undefined, "development"),
    developmentMapStyleUrl,
  );
});

test("does not use demo tiles in production", () => {
  assert.equal(resolveMapStyleUrl(undefined, "production"), null);
  assert.equal(resolveMapStyleUrl("   ", "production"), null);
});
