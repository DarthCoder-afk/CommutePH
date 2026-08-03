import assert from "node:assert/strict";
import test from "node:test";

import {
  assemblePublishedRouteSchedules,
  type RawTransportRouteScheduleRecord,
} from "./assemble-published-route-schedules";

/*
 * Development fixtures only.
 * These values do not describe a real transport schedule.
 */
const PROVISIONAL_ROUTE_ID = "provisional-route";
const CURRENT_TIME = new Date("2026-01-15T00:00:00.000Z");
const VERIFIED_AT = new Date("2026-01-01T00:00:00.000Z");

const PROVISIONAL_SCHEDULES: RawTransportRouteScheduleRecord[] = [
  {
    id: "schedule-two",
    transportRouteId: PROVISIONAL_ROUTE_ID,
    position: 2,
    serviceDays: " Provisional second service period ",
    operatingHours: " Provisional second operating window ",
    publicNotes: null,
    lastVerifiedAt: VERIFIED_AT,
    isActive: true,
  },
  {
    id: "schedule-one",
    transportRouteId: PROVISIONAL_ROUTE_ID,
    position: 1,
    serviceDays: " Provisional first service period ",
    operatingHours: " Provisional first operating window ",
    publicNotes: " Provisional schedule note ",
    lastVerifiedAt: VERIFIED_AT,
    isActive: true,
  },
  {
    id: "schedule-inactive",
    transportRouteId: PROVISIONAL_ROUTE_ID,
    position: 3,
    serviceDays: "Provisional inactive service period",
    operatingHours: "Provisional inactive operating window",
    publicNotes: null,
    lastVerifiedAt: VERIFIED_AT,
    isActive: false,
  },
  {
    id: "schedule-other-route",
    transportRouteId: "another-provisional-route",
    position: 1,
    serviceDays: "Provisional unrelated service period",
    operatingHours: "Provisional unrelated operating window",
    publicNotes: null,
    lastVerifiedAt: VERIFIED_AT,
    isActive: true,
  },
];

test("orders and normalizes active verified provisional schedules", () => {
  const result = assemblePublishedRouteSchedules(
    PROVISIONAL_ROUTE_ID,
    PROVISIONAL_SCHEDULES,
    CURRENT_TIME,
  );

  assert.deepEqual(
    result.map((schedule) => schedule.position),
    [1, 2],
  );

  assert.equal(result[0]?.serviceDays, "Provisional first service period");

  assert.equal(result[0]?.operatingHours, "Provisional first operating window");

  assert.equal(result[0]?.publicNotes, "Provisional schedule note");

  assert.equal(result[0]?.lastVerifiedAt, VERIFIED_AT.toISOString());
});

test("excludes inactive and unverified provisional schedules", () => {
  const result = assemblePublishedRouteSchedules(
    PROVISIONAL_ROUTE_ID,
    [
      {
        ...PROVISIONAL_SCHEDULES[0]!,
        position: 1,
        isActive: false,
      },
      {
        ...PROVISIONAL_SCHEDULES[1]!,
        position: 2,
        lastVerifiedAt: null,
      },
    ],
    CURRENT_TIME,
  );

  assert.deepEqual(result, []);
});

test("rejects non-gapless published schedule positions", () => {
  assert.throws(
    () =>
      assemblePublishedRouteSchedules(
        PROVISIONAL_ROUTE_ID,
        [
          {
            ...PROVISIONAL_SCHEDULES[0]!,
            position: 2,
          },
        ],
        CURRENT_TIME,
      ),
    /Expected 1, received 2/,
  );
});

test("rejects blank provisional operating hours", () => {
  assert.throws(
    () =>
      assemblePublishedRouteSchedules(
        PROVISIONAL_ROUTE_ID,
        [
          {
            ...PROVISIONAL_SCHEDULES[1]!,
            position: 1,
            operatingHours: "   ",
          },
        ],
        CURRENT_TIME,
      ),
    /operating hours cannot be blank/,
  );
});

test("rejects a future provisional verification date", () => {
  assert.throws(
    () =>
      assemblePublishedRouteSchedules(
        PROVISIONAL_ROUTE_ID,
        [
          {
            ...PROVISIONAL_SCHEDULES[1]!,
            position: 1,
            lastVerifiedAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        ],
        CURRENT_TIME,
      ),
    /future verification date/,
  );
});
