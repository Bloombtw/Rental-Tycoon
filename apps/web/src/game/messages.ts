import {
  FleetFullError,
  InsufficientCashError,
  InvalidPriceError,
  MAX_CAR_DAILY_PRICE,
  SimOverflowError,
  UnknownCarError,
  UnknownCarModelError,
  type CarModelId,
} from "@rt/sim";
import { formatCents } from "../format.js";

export const CAR_MODEL_LABELS: Readonly<Record<CarModelId, string>> = Object.freeze({
  used: "Citadine d'occasion",
  compact: "Citadine neuve",
  hybrid: "Berline hybride",
});

export const PRICE_FORMAT_ERROR = "Format invalide : saisissez un montant en euros, par ex. 89,90.";

export const PRICE_RANGE_ERROR = `Le prix doit être compris entre ${formatCents(0)} et ${formatCents(MAX_CAR_DAILY_PRICE)} par jour.`;

const GENERIC_ERROR = "Une erreur inattendue est survenue : action annulée.";

/** Maps any thrown value to a French message. Never throws. */
export function errorMessage(error: unknown): string {
  try {
    if (error instanceof InsufficientCashError) {
      return `Fonds insuffisants : il faut ${formatCents(error.required)}, vous avez ${formatCents(error.available)}.`;
    }
    if (error instanceof FleetFullError) {
      const max = Number.isSafeInteger(error.maxFleetSize) ? String(error.maxFleetSize) : "—";
      return `Flotte complète : ${max} voitures maximum.`;
    }
    if (error instanceof UnknownCarModelError) return "Modèle de voiture inconnu.";
    if (error instanceof UnknownCarError) return "Cette voiture n'existe pas.";
    if (error instanceof InvalidPriceError) return PRICE_RANGE_ERROR;
    if (error instanceof SimOverflowError) {
      return "La simulation a atteint une limite numérique : action annulée.";
    }
  } catch {
    // fall through to the generic message
  }
  return GENERIC_ERROR;
}
