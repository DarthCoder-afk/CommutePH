import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMetroManilaCity } from "./normalize-metro-manila-city";

test("normalizes Pasig and Pasig City to the canonical city", () => {
  assert.equal(normalizeMetroManilaCity("Pasig"), "Pasig");
  assert.equal(normalizeMetroManilaCity(" Pasig City "), "Pasig");
});

test("keeps other supported Metro Manila cities canonical", () => {
  assert.equal(normalizeMetroManilaCity("TAGUIG"), "Taguig");
  assert.equal(normalizeMetroManilaCity("Quezon City"), "Quezon City");
});

test("rejects cities outside the supported Metro Manila list", () => {
  assert.equal(normalizeMetroManilaCity("Antipolo"), null);
});
