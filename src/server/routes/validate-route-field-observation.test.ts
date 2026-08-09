import assert from "node:assert/strict";
import test from "node:test";

import { validateRouteFieldObservation } from "./validate-route-field-observation";

const currentTime = new Date("2026-08-09T10:00:00.000Z");
const confirmedInput = {
  routeSlug: "sample-route",
  outcome: "confirmed",
  observedAt: "2026-08-09T08:00:00.000Z",
  observerLabel: "Field reviewer",
  notes: "The complete route was observed in person during service.",
  observedName: "Sample Route",
  observedMode: "city_bus",
  observedOperator: "Sample Operator",
  observedSignboard: "SAMPLE",
  serviceDays: "Monday to Friday",
  operatingHours: "06:00-22:00",
  fareMinCentavos: 1500,
  fareMaxCentavos: 2500,
  paymentMethod: "Cash",
  stops: [
    {
      position: 1,
      locationSlug: "first-stop",
      canBoard: true,
      canAlight: false,
    },
    {
      position: 2,
      locationSlug: "second-stop",
      canBoard: false,
      canAlight: true,
    },
  ],
};

test("validates a complete confirmed route observation", () => {
  const result = validateRouteFieldObservation(confirmedInput, currentTime);

  assert.equal(result.outcome, "confirmed");
  assert.equal(result.stops.length, 2);
  assert.equal(result.fareMinCentavos, 1500);
});

test("accepts an incomplete needs-follow-up observation", () => {
  const result = validateRouteFieldObservation(
    {
      routeSlug: "sample-route",
      outcome: "needs_follow_up",
      observedAt: "2026-08-09T08:00:00.000Z",
      observerLabel: "Field reviewer",
      notes: "The vehicle departed before its fare could be confirmed.",
    },
    currentTime,
  );

  assert.equal(result.stops.length, 0);
  assert.equal(result.fareMinCentavos, null);
});

test("rejects incomplete confirmed observations", () => {
  assert.throws(
    () =>
      validateRouteFieldObservation(
        { ...confirmedInput, paymentMethod: undefined },
        currentTime,
      ),
    /confirmed route observation requires/,
  );
});

test("rejects invalid fares and non-gapless stops", () => {
  assert.throws(
    () =>
      validateRouteFieldObservation(
        { ...confirmedInput, fareMaxCentavos: 1000 },
        currentTime,
      ),
    /valid range/,
  );
  assert.throws(
    () =>
      validateRouteFieldObservation(
        {
          ...confirmedInput,
          stops: [
            confirmedInput.stops[0],
            { ...confirmedInput.stops[1], position: 3 },
          ],
        },
        currentTime,
      ),
    /gapless/,
  );
});

test("rejects repeated stop locations", () => {
  assert.throws(
    () =>
      validateRouteFieldObservation(
        {
          ...confirmedInput,
          stops: [
            confirmedInput.stops[0],
            { ...confirmedInput.stops[1], locationSlug: "first-stop" },
          ],
        },
        currentTime,
      ),
    /cannot repeat a location/,
  );
});
