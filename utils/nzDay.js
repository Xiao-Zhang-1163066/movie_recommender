// Every cinema we scrape is in New Zealand, so a "YYYY-MM-DD" from a user means
// an Auckland calendar day. `new Date("2026-10-22")` is UTC midnight instead,
// which is 13:00 in Auckland during daylight saving, and shifted every morning
// session onto the previous day.
const TZ = "Pacific/Auckland";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Milliseconds Auckland is ahead of UTC at the given instant (+12h or +13h).
function offsetAt(ms) {
  const p = Object.fromEntries(
    formatter.formatToParts(new Date(ms)).map(({ type, value }) => [type, value]),
  );
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// The instant Auckland midnight begins on the given calendar day. Checking the
// offset a second time handles the days daylight saving starts or ends.
function nzMidnight(year, month, day) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

/** [start, end) of an Auckland calendar day, as UTC instants. */
export function nzDayRange(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { start: nzMidnight(year, month, day), end: nzMidnight(year, month, day + 1) };
}
