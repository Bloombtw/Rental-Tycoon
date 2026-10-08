import { departureMinute, returnMinute, type Car } from "@rt/sim";
import { formatCents } from "../format.js";
import { formatTimeOfDay } from "../game/clock.js";
import { CAR_MODEL_LABELS } from "../game/messages.js";

export interface CarTooltipContent {
  readonly title: string;
  readonly status: string;
  readonly price: string;
  readonly rented: boolean;
}

/** Text of the car tooltip. Tolerates corrupted fields: never prints NaN or undefined. */
export function carTooltip(car: Car, index: number, timeOfDay: number): CarTooltipContent {
  const id = Number.isSafeInteger(car.id) ? String(car.id) : "—";
  const model = car.model;
  const label =
    typeof model === "string" && Object.hasOwn(CAR_MODEL_LABELS, model)
      ? CAR_MODEL_LABELS[model]
      : null;
  const title = label !== null ? `Voiture n°${id} · ${label}` : `Voiture n°${id}`;

  const rented = car.rented === true;
  const dep = departureMinute(index);
  const ret = returnMinute(index);
  const t = Number.isFinite(timeOfDay) ? timeOfDay : 0;
  let status: string;
  if (rented && dep !== null && ret !== null && t >= dep && t < ret) {
    status = `En location, retour à ${formatTimeOfDay(ret)}`;
  } else {
    status = rented && dep !== null && t >= dep ? "Au parking (louée aujourd'hui)" : "Au parking";
  }
  return { title, status, price: `Prix : ${formatCents(car.dailyPrice)}/jour`, rented };
}
