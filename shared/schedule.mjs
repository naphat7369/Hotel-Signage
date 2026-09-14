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
  const currentStr = t.date + " " + String(Math.floor(t.minute / 60)).padStart(2, '0') + ":" + String(t.minute % 60).padStart(2, '0');
  const isAllDay = schedule.startTime === schedule.endTime;
  const startStr = schedule.startDate + " " + schedule.startTime;
  const endStr = schedule.endDate + " " + (isAllDay ? "23:59" : schedule.endTime);
  
  if (currentStr < startStr || currentStr > endStr) return false;
  
  if (!schedule.days.includes(new Date(t.date + "T12:00:00Z").getUTCDay()))
    return false;
    
  return true;
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
