import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeekDayKeys,
  manilaWeekStartKey,
  shiftWeekStartKey,
} from "../src/lib/booking/week-calendar";
import {
  buildCourtHourGrid,
  courtStatusForHour,
  manilaHourStart,
} from "../src/lib/booking/court-availability";

describe("week calendar helpers", () => {
  it("builds 7 consecutive day keys", () => {
    const keys = buildWeekDayKeys("2026-03-02");
    assert.equal(keys.length, 7);
    assert.equal(keys[0], "2026-03-02");
    assert.equal(keys[6], "2026-03-08");
  });

  it("shifts week by one", () => {
    assert.equal(shiftWeekStartKey("2026-03-02", 1), "2026-03-09");
    assert.equal(shiftWeekStartKey("2026-03-02", -1), "2026-02-23");
  });

  it("manilaWeekStartKey returns YYYY-MM-DD", () => {
    const key = manilaWeekStartKey(new Date("2026-03-05T12:00:00+08:00"));
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("court hour grid", () => {
  const court = { id: "c1", name: "Court 1" };
  const dayKey = "2026-03-10";

  it("marks booked when booking overlaps hour", () => {
    const start = manilaHourStart(dayKey, 10);
    const end = new Date(start.getTime() + 3600000);
    const status = courtStatusForHour(
      court.id,
      start,
      end,
      [
        {
          court_id: court.id,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
        },
      ],
      []
    );
    assert.equal(status, "booked");
  });

  it("buildCourtHourGrid includes open hours only", () => {
    const { hours, cells } = buildCourtHourGrid({
      dayKey,
      openHour: 6,
      closeHour: 9,
      courts: [court],
      bookings: [],
      blocks: [],
    });
    assert.deepEqual(hours, [6, 7, 8]);
    assert.equal(cells[court.id][6], "available");
  });
});
