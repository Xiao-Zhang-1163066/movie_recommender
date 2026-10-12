import { describe, it, expect } from "vitest";
import { nzDayRange } from "../utils/nzDay.js";

const hours = ({ start, end }) => (end - start) / 3_600_000;

describe("nzDayRange", () => {
  it("starts at Auckland midnight during daylight saving (UTC+13)", () => {
    const day = nzDayRange("2026-10-22");
    expect(day.start).toEqual(new Date("2026-10-21T11:00:00Z"));
    expect(day.end).toEqual(new Date("2026-10-22T11:00:00Z"));
  });

  it("starts at Auckland midnight in winter (UTC+12)", () => {
    expect(nzDayRange("2026-06-15").start).toEqual(new Date("2026-06-14T12:00:00Z"));
  });

  // The two days a year where "add 24 hours" gives the wrong end of the day.
  it("is 23 hours long the day daylight saving starts", () => {
    expect(hours(nzDayRange("2026-09-27"))).toBe(23);
  });

  it("is 25 hours long the day daylight saving ends", () => {
    expect(hours(nzDayRange("2026-04-05"))).toBe(25);
  });

  it("rolls over month and year ends", () => {
    expect(nzDayRange("2026-12-31").end).toEqual(new Date("2026-12-31T11:00:00Z"));
  });
});
