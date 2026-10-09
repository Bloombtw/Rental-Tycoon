/** Whole local calendar day number (days since 1970-01-01 in the player's time zone). */
export function calendarDay(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0;
  const offsetMin = new Date(nowMs).getTimezoneOffset(); // minutes behind UTC
  return Math.max(0, Math.floor((nowMs - offsetMin * 60_000) / 86_400_000));
}
