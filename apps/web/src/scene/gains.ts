import { departureMinute, type Cents, type GameState } from "@rt/sim";

/** A car that left on a rental between two committed states. */
export interface Departure {
  readonly index: number;
  readonly amount: Cents;
}

/** Most "+X €" bubbles alive at once (x10 can rent dozens of cars per second). */
export const MAX_GAIN_FLOATS = 8;

function slotCrossed(dep: number, fromMin: number, toMin: number, dayDiff: number): boolean {
  // Events of minutes [from, to) are processed: same day, or across exactly one closing.
  if (dayDiff === 0) return dep >= fromMin && dep < toMin;
  return dep >= fromMin || dep < toMin;
}

/**
 * Cars rented at a departure slot crossed between `prev` and `next` (gain-feedback). Nothing for a
 * jump of more than one day (offline days, new game, load): those are not live departures.
 */
export function departuresBetween(
  prev: { readonly day: number; readonly minute: number },
  next: GameState,
): Departure[] {
  const dayDiff = next.day - prev.day;
  if (!Number.isSafeInteger(dayDiff) || dayDiff < 0 || dayDiff > 1) return [];
  if (dayDiff === 0 && next.minute <= prev.minute) return [];
  const out: Departure[] = [];
  next.fleet.forEach((car, index) => {
    if (car.rented !== true || car.outcome !== "rented") return;
    const dep = departureMinute(index);
    if (dep === null || !slotCrossed(dep, prev.minute, next.minute, dayDiff)) return;
    if (!Number.isSafeInteger(car.dailyPrice) || car.dailyPrice <= 0) return;
    out.push({ index, amount: car.dailyPrice });
  });
  return out;
}
