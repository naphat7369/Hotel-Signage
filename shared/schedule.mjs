export function localTime(date, timezone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
}
export function active(schedule, instant = new Date()) {
  const t = localTime(instant, schedule.timezone || "Asia/Bangkok");
  const minutes = (s) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
  const start = minutes(schedule.startTime),
    end = minutes(schedule.endTime);
  let day = t.date;
  if (end < start && t.minute < end)
    day = new Date(Date.parse(day + "T12:00:00Z") - 86400000)
      .toISOString()
      .slice(0, 10);
  if (day < schedule.startDate || day > schedule.endDate) return false;
  if (!schedule.days.includes(new Date(day + "T12:00:00Z").getUTCDay()))
    return false;
  return (
    start === end ||
    (end > start
      ? t.minute >= start && t.minute < end
      : t.minute >= start || t.minute < end)
  );
}
export function selectProgram(manifest, instant = new Date()) {
  const winner = manifest.schedules
    .filter((s) => active(s, instant))
    .sort(
      (a, b) =>
        b.specificity - a.specificity ||
        b.publishedAt - a.publishedAt ||
        b.id.localeCompare(a.id),
    )[0];
  return winner?.snapshot || manifest.fallback || null;
}
