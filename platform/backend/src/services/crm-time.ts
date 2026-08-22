const timezone = "America/Sao_Paulo";

function partsAt(date: Date) {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(values.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as Record<string, number>;
}

function offsetAt(date: Date) {
  const value = partsAt(date);
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second) - date.getTime();
}

function midnightUtc(year: number, month: number, day: number) {
  const guess = new Date(Date.UTC(year, month - 1, day));
  return new Date(guess.getTime() - offsetAt(guess));
}

/** Brazilian product default. A future company timezone setting can replace this helper. */
export function saoPauloDayBounds(now: Date) {
  const local = partsAt(now);
  const start = midnightUtc(local.year, local.month, local.day);
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const end = midnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { start, end };
}
