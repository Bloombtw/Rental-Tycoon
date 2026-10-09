import {
  CAR_MODELS,
  CAR_MODEL_IDS,
  PRODUCTS,
  BoosterUnaffordableError,
  CarBrokenError,
  CarInServiceError,
  CarNotBrokenError,
  CarRentedOutError,
  EVENTS,
  EVENT_KINDS,
  MissionNotReadyError,
  InvalidReceiptError,
  ProductAlreadyOwnedError,
  FleetFullError,
  InsufficientCashError,
  InvalidPriceError,
  MAX_CAR_DAILY_PRICE,
  MAX_FLEET_SIZE,
  ManagerStateError,
  ModelLockedError,
  UnknownManagerError,
  SimOverflowError,
  UnknownCarError,
  UnknownCarModelError,
  UnknownUpgradeError,
  UpgradeMaxedError,
  type ActiveEvent,
  type CarModelId,
  type BoosterId,
  type EventKind,
  type ManagerId,
  type Mission,
  type MissionGoal,
  type ProductId,
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

export const EVENT_LABELS: Readonly<Record<EventKind, string>> = Object.freeze({
  holidays: "Vacances scolaires",
  carShow: "Salon de l'auto",
  strike: "Grève des transports",
  storm: "Tempête",
});

/** Short names for the HUD chip. */
export const EVENT_SHORT_LABELS: Readonly<Record<EventKind, string>> = Object.freeze({
  holidays: "Vacances",
  carShow: "Salon",
  strike: "Grève",
  storm: "Tempête",
});

const multiplierFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function isEventKind(kind: unknown): kind is EventKind {
  return typeof kind === "string" && (EVENT_KINDS as readonly string[]).includes(kind);
}

/** "Clients × 2", "Prix de référence + 30 %": what an event does. Never throws. */
export function eventEffectText(kind: EventKind): string {
  if (!isEventKind(kind)) return "Effet inconnu";
  const spec = EVENTS[kind];
  const parts: string[] = [];
  if (Number.isFinite(spec.demandPct) && spec.demandPct > 0 && spec.demandPct !== 100) {
    parts.push(`Clients × ${multiplierFormat.format(spec.demandPct / 100)}`);
  }
  if (Number.isFinite(spec.referencePct) && spec.referencePct > 0 && spec.referencePct !== 100) {
    const delta = spec.referencePct - 100;
    const sign = delta > 0 ? "+" : "−";
    parts.push(`Prix de référence ${sign} ${multiplierFormat.format(Math.abs(delta))} %`);
  }
  return parts.length > 0 ? parts.join(", ") : "Aucun effet";
}

/** « Événement : Vacances scolaires — clients × 2 pendant 3 jours ». Never throws. */
export function eventBannerText(event: ActiveEvent): string {
  if (!isEventKind(event.kind)) return "Événement en cours";
  const days = event.endDay - event.startDay;
  const n = Number.isSafeInteger(days) && days >= 1 ? days : 1;
  const effect = eventEffectText(event.kind);
  const effectLower = effect.charAt(0).toLowerCase() + effect.slice(1);
  return `Événement : ${EVENT_LABELS[event.kind]} — ${effectLower} pendant ${String(n)} jour${n > 1 ? "s" : ""}`;
}

export const PURCHASE_FAILED_ERROR =
  "Le paiement n'a pas pu démarrer. Vérifiez votre connexion et réessayez.";

export const BOOSTER_LABELS: Readonly<Record<BoosterId, string>> = Object.freeze({
  revenue_x2: "Recettes ×2 (1 jour)",
  revenue_x2_3d: "Recettes ×2 (3 jours)",
  demand_plus: "Affluence +50 % (1 jour)",
  cash_bundle: "Liasse de 10 000 €",
});

export const PRODUCT_LABELS: Readonly<Record<ProductId, string>> = Object.freeze({
  starter_pack: "Pack de démarrage",
  gems_small: "Poignée de diamants",
  gems_medium: "Sac de diamants",
  gems_large: "Coffre de diamants",
  gems_huge: "Trésor de diamants",
});

const gemFormat = new Intl.NumberFormat("fr-FR");

/** "1 200 diamants". */
export function gemsText(n: number): string {
  const v = Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return `${gemFormat.format(v)} diamant${v > 1 ? "s" : ""}`;
}

/** Notice after a credited purchase. */
export function purchaseNotice(productId: string): string {
  if (!Object.hasOwn(PRODUCTS, productId)) return "Achat crédité.";
  const p = PRODUCTS[productId as ProductId];
  const cash = p.cash > 0 ? ` et ${formatCents(p.cash)}` : "";
  return `Merci ! +${gemsText(p.gems)}${cash}.`;
}

/** French text of a mission goal. */
export function missionText(goal: MissionGoal): string {
  switch (goal.kind) {
    case "ownCars":
      return `Possédez ${String(goal.count)} voitures`;
    case "ownModel":
      return `Possédez ${String(goal.count)} × ${CAR_MODEL_LABELS[goal.model]}`;
    case "dayRevenue":
      return `Encaissez ${formatCents(goal.amount)} en une journée`;
    case "cash":
      return `Ayez ${formatCents(goal.amount)} en caisse`;
    case "level":
      return `Atteignez le niveau ${String(goal.level)}`;
    case "upgrade":
      return `${UPGRADE_LABELS[goal.upgrade]} : niveau ${String(goal.level)}`;
    case "hire":
      return `Embauchez un ${MANAGER_LABELS[goal.manager].toLowerCase()}`;
  }
}

/** Notice for missions just completed. */
export function missionNotice(completed: readonly Mission[]): string {
  const total = completed.reduce((sum, m) => sum + m.reward, 0);
  const first = completed[0];
  if (completed.length === 1 && first) {
    return `Mission accomplie : ${missionText(first.goal)} ! +${formatCents(total)}`;
  }
  return `${String(completed.length)} missions accomplies ! +${formatCents(total)}`;
}

export const MANAGER_LABELS: Readonly<Record<ManagerId, string>> = Object.freeze({
  sales: "Commercial",
  pricing: "Gérant",
  mechanic: "Mécanicien",
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
  /** Current breakdown flag; when known it wins over a stale `outcome`. */
  readonly broken?: unknown;
}): string {
  if (car.rented === true) return "Louée";
  if (car.broken === true) return "Au parking · en panne";
  // A repaired car keeps its last outcome until its next slot: do not call it broken.
  if (car.broken === false && car.outcome === "broken") return "Au parking";
  if (car.outcome === "tooExpensive") return "Au parking · trop cher";
  if (car.outcome === "noCustomer") return "Au parking · pas de client";
  if (car.outcome === "broken") return "Au parking · en panne";
  return "Au parking";
}

/** Condition (0-100 %) as a whole number; anything else counts as 0. Never NaN. */
export function conditionPct(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 0;
}

/** Colour band of the condition bar: green from 70 %, orange from 40 %, red below. */
export function conditionTone(pct: number): "good" | "warn" | "bad" {
  const p = conditionPct(pct);
  if (p >= 70) return "good";
  if (p >= 40) return "warn";
  return "bad";
}

/** "12 j": age in days of a car; invalid values count as 0. */
export function ageText(days: unknown): string {
  const n = typeof days === "number" && Number.isSafeInteger(days) && days >= 0 ? days : 0;
  return `${String(n)} j`;
}

/** Why a car cannot be sold right now. */
export const SELL_BLOCKED_REASON = "En location : vente impossible";

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
      return `Verrouillé : atteignez le niveau ${lvl} de l'agence.`;
    }
    if (error instanceof ManagerStateError) {
      return error.alreadyHired ? "Déjà embauché." : "Personne à ce poste.";
    }
    if (error instanceof UnknownManagerError) return "Poste inconnu.";
    if (error instanceof MissionNotReadyError) return "Cette mission n'est pas encore accomplie.";
    if (error instanceof BoosterUnaffordableError) {
      return `Pas assez de diamants : il en faut ${String(error.required)}.`;
    }
    if (error instanceof ProductAlreadyOwnedError) return "Ce pack ne s'achète qu'une fois.";
    if (error instanceof InvalidReceiptError) return "Achat invalide : rien n'a été crédité.";
    if (error instanceof UpgradeMaxedError) return "Cette amélioration est déjà au niveau maximum.";
    if (error instanceof UnknownUpgradeError) return "Amélioration inconnue.";
    if (error instanceof UnknownCarModelError) return "Modèle de voiture inconnu.";
    if (error instanceof UnknownCarError) return "Cette voiture n'existe pas.";
    if (error instanceof CarNotBrokenError) return "Cette voiture n'est pas en panne.";
    if (error instanceof CarBrokenError) return "Cette voiture est en panne : réparez-la d'abord.";
    if (error instanceof CarInServiceError) return "Cette voiture est déjà en parfait état.";
    if (error instanceof CarRentedOutError) {
      return "Cette voiture est en location : attendez son retour pour la vendre.";
    }
    if (error instanceof InvalidPriceError) return PRICE_RANGE_ERROR;
    if (error instanceof SimOverflowError) {
      return "La simulation a atteint une limite numérique : action annulée.";
    }
  } catch {
    // fall through to the generic message
  }
  return GENERIC_ERROR;
}
