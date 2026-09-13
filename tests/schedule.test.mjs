import test from "node:test";
import assert from "node:assert/strict";
import { active, selectProgram } from "../shared/schedule.mjs";
const s = {
  id: "a",
  timezone: "Asia/Bangkok",
  startDate: "2026-09-13",
  endDate: "2026-09-13",
  startTime: "22:00",
  endTime: "02:00",
  days: [0],
  specificity: 4,
  publishedAt: 1,
  snapshot: { id: "one" },
};
test("overnight schedule anchors weekday and date to start day", () => {
  assert.equal(active(s, new Date("2026-09-13T16:00:00Z")), true);
  assert.equal(active(s, new Date("2026-09-13T18:30:00Z")), true);
  assert.equal(active(s, new Date("2026-09-13T19:00:00Z")), false);
  assert.equal(active(s, new Date("2026-09-12T18:30:00Z")), false);
});
test("specificity then publication determines winner; fallback outside time", () => {
  const manifest = {
    schedules: [
      { ...s, specificity: 1, publishedAt: 99, snapshot: { id: "org" } },
      s,
      { ...s, id: "b", publishedAt: 2, snapshot: { id: "new" } },
    ],
    fallback: { id: "default" },
  };
  assert.equal(
    selectProgram(manifest, new Date("2026-09-13T16:00Z")).id,
    "new",
  );
  assert.equal(
    selectProgram(manifest, new Date("2026-09-14T16:00Z")).id,
    "default",
  );
});
test("equal times are all day and DST uses branch timezone", () => {
  assert.equal(
    active(
      { ...s, startTime: "00:00", endTime: "00:00" },
      new Date("2026-09-13T00:00Z"),
    ),
    true,
  );
  const ny = {
    ...s,
    timezone: "America/New_York",
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    startTime: "01:00",
    endTime: "02:00",
  };
  assert.equal(active(ny, new Date("2026-11-01T05:30Z")), true);
  assert.equal(active(ny, new Date("2026-11-01T06:30Z")), true);
});
