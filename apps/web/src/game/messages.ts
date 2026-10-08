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

export const SAVE_CORRUPT_ERROR = "Sauvegarde illisible : une nouvelle partie a commencé.";
export const SAVE_NEWER_ERROR =
  "Cette sauvegarde vient d'une version plus récente du jeu : une nouvelle partie a commencé. Mettez l'application à jour pour la retrouver.";
export const SAVE_UNAVAILABLE_WARNING =
  "Sauvegarde indisponible sur cet appareil : la partie sera perdue en fermant l'application.";
export const SAVE_FAILED_WARNING =
  "Sauvegarde impossible (stockage plein ?) : la partie continue mais ne sera pas conservée.";
export const NEW_GAME_NOTICE = "Nouvelle partie commencée.";

export function resumeNotice(clock: string): string {
  return `Partie reprise : ${clock}. Touchez Reprendre pour continuer.`;
}

export function newGameSummary(clock: string, cash: string, cars: number): string {
  const n = Number.isSafeInteger(cars) && cars >= 0 ? cars : 0;
  return `Ta partie actuelle (${clock}, ${cash}, ${n} voiture${n > 1 ? "s" : ""}) sera définitivement effacée.`;
}

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
