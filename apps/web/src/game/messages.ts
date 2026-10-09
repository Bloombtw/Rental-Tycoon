import {
  CAR_MODELS,
  CAR_MODEL_IDS,
  FleetFullError,
  InsufficientCashError,
  InvalidPriceError,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  ModelLockedError,
  SimOverflowError,
  UnknownCarError,
  UnknownCarModelError,
  UnknownUpgradeError,
  UpgradeMaxedError,
  type CarModelId,
  type UpgradeId,
} from "@rt/sim";
import { formatCents } from "../format.js";

export const CAR_MODEL_LABELS: Readonly<Record<CarModelId, string>> = Object.freeze({
  used: "Citadine d'occasion",
  compact: "Citadine neuve",
  hybrid: "Berline hybride",
  suv: "SUV familial",
  van: "Utilitaire",
  electric: "Citadine électrique",
  sport: "Coupé sport",
  luxury: "SUV de luxe",
});

export const UPGRADE_LABELS: Readonly<Record<UpgradeId, string>> = Object.freeze({
  parking: "Agrandir le parking",
  counter: "Comptoir rapide",
  ads: "Publicité",
  wash: "Station de lavage",
});

/** Level-up message: the models it unlocks (agency-level.md). */
export function levelUpNotice(level: number): string {
  const models = CAR_MODEL_IDS.filter((id) => CAR_MODELS[id].unlockLevel === level).map(
    (id) => CAR_MODEL_LABELS[id],
  );
  const unlock = models.length > 0 ? ` Nouveau modèle : ${models.join(", ")}.` : "";
  return `Niveau ${String(level)} atteint !${unlock}`;
}

/** Status label of a car: why it stayed at the lot at its last slot, when known. */
export function carStatusLabel(car: {
  readonly rented: boolean;
  readonly outcome?: unknown;
}): string {
  if (car.rented === true) return "Louée";
  if (car.outcome === "tooExpensive") return "Au parking · trop cher";
  if (car.outcome === "noCustomer") return "Au parking · pas de client";
  return "Au parking";
}

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
      const max = Number.isSafeInteger(error.maxFleetSize) ? error.maxFleetSize : null;
      if (max !== null && max < MAX_FLEET_SIZE) {
        return `Parking plein : ${String(max)} places. Agrandissez le parking.`;
      }
      return `Flotte complète : ${max === null ? "—" : String(max)} voitures maximum.`;
    }
    if (error instanceof ModelLockedError) {
      const lvl = Number.isSafeInteger(error.requiredLevel) ? String(error.requiredLevel) : "—";
      return `Modèle verrouillé : atteignez le niveau ${lvl} de l'agence.`;
    }
    if (error instanceof UpgradeMaxedError) return "Cette amélioration est déjà au niveau maximum.";
    if (error instanceof UnknownUpgradeError) return "Amélioration inconnue.";
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
