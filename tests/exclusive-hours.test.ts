import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatExclusiveHourLabel,
  lastExclusiveSlotStartHour,
  validateExclusiveHours,
} from "../src/lib/exclusive-hours";

describe("exclusive booking hours (member app parity)", () => {
  it("validates morning–6pm window", () => {
    const result = validateExclusiveHours(6, 18);
    assert.equal(result.ok, true);
  });

  it("last slot starts at 5pm when close is 18", () => {
    assert.equal(lastExclusiveSlotStartHour(6, 18), 17);
    assert.equal(formatExclusiveHourLabel(17), "5:00 PM");
  });

  it("rejects close before open", () => {
    const result = validateExclusiveHours(18, 6);
    assert.equal(result.ok, false);
  });
});
