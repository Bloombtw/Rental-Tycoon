import { CAR_MODELS, UPGRADES, fleetCapacity, upgradeCost, type GameState } from "@rt/sim";
import { formatCents } from "../format.js";

/**
 * Forced tutorial with René, the retiring manager (tutorial.md, rev. 2). Pure: step + event ->
 * next step, and the script (bubbles, target, waiting mode) of every step. No DOM, no timers.
 */
export type TutorialStep =
  | "welcome"
  | "openCars"
  | "buyUsed"
  | "openFleet"
  | "setPrice"
  | "startTime"
  | "speedUp"
  | "watchCar"
  | "openUpgrades"
  | "buyUpgrade"
  | "missions"
  | "dayEnd"
  | "goodbye"
  | "done";

export type TutorialEvent =
  | { type: "tap" } // tap on the overlay (bubble finished)
  | { type: "panelOpened"; panel: string } // side menu id
  | { type: "drawerOpened" }
  | { type: "carBought" }
  | { type: "priceSet" }
  | { type: "timeStarted" }
  | { type: "speedSet"; speed: number }
  | { type: "carDeparted"; amount: number } // cents
  | { type: "upgradeBought" }
  | { type: "dayClosed" };

export type TutorialTarget =
  | { kind: "dom"; id: string } // [data-tutorial="<id>"]
  | { kind: "car" } // the departing car, projected from the 3D scene
  | { kind: "none" };

export interface TutorialScript {
  readonly lines: readonly string[]; // René's bubbles, in order
  readonly target: TutorialTarget;
  readonly waitsFor: "tap" | "action";
  readonly blocksTime: boolean; // true: the clock stays paused while the step shows
}

/** The steps in order (the last one is "done"). */
export const TUTORIAL_ORDER: readonly TutorialStep[] = Object.freeze([
  "welcome",
  "openCars",
  "buyUsed",
  "openFleet",
  "setPrice",
  "startTime",
  "speedUp",
  "watchCar",
  "openUpgrades",
  "buyUpgrade",
  "missions",
  "dayEnd",
  "goodbye",
  "done",
] as const);

export function isTutorialStep(value: unknown): value is TutorialStep {
  return typeof value === "string" && (TUTORIAL_ORDER as readonly string[]).includes(value);
}

/** Events the UI itself may send (the others come from the reducer, from real game actions). */
export function isUiTutorialEvent(value: unknown): value is TutorialEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as { type?: unknown; panel?: unknown };
  if (e.type === "tap" || e.type === "drawerOpened") return true;
  return e.type === "panelOpened" && typeof e.panel === "string" && e.panel.length <= 32;
}

/** First step for a game: the tutorial only runs for a brand-new agency. */
/** Cash René tops the empty till up to before the first purchase (tutorial.md). */
export const TUTORIAL_START_FUNDS = 5_000_00;
/** René's parting gift when the tutorial ends. */
export const TUTORIAL_FAREWELL_FUNDS = 20_000_00;

export function initialTutorial(game: GameState): TutorialStep {
  return game.day === 0 && game.minute === 0 && game.fleet.length === 0 ? "welcome" : "done";
}

/** Step after `step` when `event` happens. Events that do not matter for the step change nothing. */
export function nextTutorialStep(step: TutorialStep, event: TutorialEvent): TutorialStep {
  switch (step) {
    case "welcome":
      return event.type === "tap" ? "openCars" : step;
    case "openCars":
      return event.type === "panelOpened" && event.panel === "cars" ? "buyUsed" : step;
    case "buyUsed":
      return event.type === "carBought" ? "openFleet" : step;
    case "openFleet":
      return event.type === "drawerOpened" ? "setPrice" : step;
    case "setPrice":
      return event.type === "priceSet" ? "startTime" : step;
    case "startTime":
      return event.type === "timeStarted" ? "speedUp" : step;
    case "speedUp":
      return event.type === "speedSet" && Number.isFinite(event.speed) && event.speed >= 2
        ? "watchCar"
        : step;
    case "watchCar":
      // The departure only reveals the "+X €" bubble (see tutorialScript); the tap leaves.
      return event.type === "tap" ? "openUpgrades" : step;
    case "openUpgrades":
      return event.type === "panelOpened" && event.panel === "upgrades" ? "buyUpgrade" : step;
    case "buyUpgrade":
      return event.type === "upgradeBought" ? "missions" : step;
    case "missions":
      return event.type === "tap" ? "dayEnd" : step;
    case "dayEnd":
      return event.type === "dayClosed" ? "goodbye" : step;
    case "goodbye":
      return event.type === "tap" ? "done" : step;
    case "done":
      return step;
  }
}

/**
 * Brings a step back in line with the game: an "action" step whose action is already done moves
 * on (reload), a step that cannot be done is skipped (replay), nothing is left without an exit.
 * `replay`: the tutorial is shown again on an advanced game.
 */
export function settleTutorial(step: TutorialStep, game: GameState, replay: boolean): TutorialStep {
  let current = step;
  for (let guard = 0; guard < TUTORIAL_ORDER.length; guard++) {
    const next = settleOnce(current, game, replay);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function settleOnce(step: TutorialStep, game: GameState, replay: boolean): TutorialStep {
  const index = TUTORIAL_ORDER.indexOf(step);
  const buyIndex = TUTORIAL_ORDER.indexOf("buyUsed");
  // Every step after the purchase needs a car.
  if (index > buyIndex && step !== "done" && game.fleet.length === 0) return "openCars";
  switch (step) {
    case "buyUsed": {
      const cannotBuy =
        game.fleet.length >= fleetCapacity(game.upgrades) ||
        game.cash < CAR_MODELS.used.purchasePrice;
      return replay ? (cannotBuy ? "openFleet" : step) : game.fleet.length > 0 ? "openFleet" : step;
    }
    case "buyUpgrade": {
      const level = game.upgrades.ads;
      if (level >= UPGRADES.ads.maxLevel) return "missions";
      if (replay && game.cash < upgradeCost("ads", level)) return "missions";
      return !replay && level > 0 ? "missions" : step;
    }
    case "dayEnd":
      return game.day >= 1 ? "goodbye" : step;
    default:
      return step;
  }
}

const WELCOME: TutorialScript = Object.freeze({
  lines: Object.freeze([
    "Ah, te voilà ! Moi, c'est René. Trente ans que je tiens cette agence de location.",
    "Mais mon dos dit stop : je prends ma retraite, et c'est toi qui reprends les clés.",
    "Pas de panique, je te montre le métier. Touche l'écran pour continuer.",
  ]),
  target: Object.freeze({ kind: "none" }),
  waitsFor: "tap",
  blocksTime: true,
});

function script(
  lines: readonly string[],
  target: TutorialTarget,
  waitsFor: "tap" | "action",
  blocksTime: boolean,
): TutorialScript {
  return Object.freeze({ lines: Object.freeze([...lines]), target, waitsFor, blocksTime });
}

function dom(id: string): TutorialTarget {
  return Object.freeze({ kind: "dom", id });
}

const NONE: TutorialTarget = Object.freeze({ kind: "none" });

function money(cents: unknown): string {
  return typeof cents === "number" && Number.isFinite(cents) ? formatCents(cents) : "0 €";
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** René's lines, target and waiting mode for a step. Never contains `undefined` or `NaN`. */
export function tutorialScript(
  step: TutorialStep,
  ctx: {
    lastGain: number | null;
    report: { revenue: number; costs: number } | null;
  },
): TutorialScript {
  switch (step) {
    case "welcome":
      return WELCOME;
    case "openCars":
      return script(
        [
          `La caisse est vide, alors je te lance : voilà ${money(TUTORIAL_START_FUNDS)}. Pas un centime de plus, hein !`,
          "Une agence sans voiture, c'est un parking vide… Ouvre le garage : touche « Voitures ».",
        ],
        dom("rail-cars"),
        "action",
        true,
      );
    case "buyUsed":
      return script(
        ["Prends la citadine d'occasion. Pas de la dentelle, mais c'est du solide."],
        dom("buy-used"),
        "action",
        true,
      );
    case "openFleet":
      return script(
        ["Viens voir ta flotte : tire sur la poignée en bas pour ouvrir le tiroir."],
        dom("drawer-handle"),
        "action",
        true,
      );
    case "setPrice":
      return script(
        [
          "Le prix, c'est toi qui décides. 90 € par jour, c'est honnête : valide-le avec le bouton.",
        ],
        dom("price-editor"),
        "action",
        true,
      );
    case "startTime":
      return script(
        ["Allez, ouvre la boutique ! Lance le temps avec le bouton de lecture."],
        dom("speed-pause"),
        "action",
        true,
      );
    case "speedUp":
      return script(
        ["Ça traîne, hein ? Accélère un peu : choisis x2 ou plus."],
        dom("speed-fast"),
        "action",
        false,
      );
    case "watchCar": {
      if (ctx.lastGain === null) {
        return script(
          ["Regarde, un client part avec ta voiture…"],
          Object.freeze({ kind: "car" }),
          "action",
          false,
        );
      }
      const gain = isAmount(ctx.lastGain)
        ? `Et voilà : +${money(ctx.lastGain)} dans la caisse !`
        : "Et voilà : la caisse se remplit !";
      return script(
        [`${gain} Une location, une rentrée d'argent. C'est aussi simple que ça.`],
        NONE,
        "tap",
        true,
      );
    }
    case "openUpgrades":
      return script(
        ["Une agence, ça s'entretient. Ouvre le menu « Agence » pour les améliorations."],
        dom("rail-upgrades"),
        "action",
        true,
      );
    case "buyUpgrade":
      return script(
        [
          "Commence par la publicité : plus de pub, plus de clients. Si ta caisse est juste, je complète, c'est cadeau.",
        ],
        dom("upgrade-buy-ads"),
        "action",
        true,
      );
    case "missions":
      return script(
        [
          "Là, ce sont les missions : accomplis-les et la caisse te remerciera.",
          "N'oublie pas la récompense quotidienne : reviens chaque jour, ça s'accumule.",
        ],
        dom("rail-missions"),
        "tap",
        true,
      );
    case "dayEnd":
      return script(
        ["Laisse tourner jusqu'à la fermeture, à 21 h. Je reste là, je regarde."],
        NONE,
        "action",
        false,
      );
    case "goodbye": {
      const r = ctx.report;
      const first =
        r !== null && Number.isFinite(r.revenue) && Number.isFinite(r.costs)
          ? `Première journée bouclée ! Recettes : ${money(r.revenue)}, charges : ${money(r.costs)}, résultat : ${money(r.revenue - r.costs)}.`
          : "Première journée bouclée !";
      return script(
        [
          first,
          "Ce bilan, tu le retrouveras chaque jour en haut de l'écran.",
          `Et pour la route, je te laisse ${money(TUTORIAL_FAREWELL_FUNDS)} de fonds de roulement. Fais-les fructifier.`,
          "Bon… je te laisse les clés. Prends soin d'elle. Salut, patron !",
        ],
        dom("hud-report"),
        "tap",
        true,
      );
    }
    case "done":
      return script([], NONE, "tap", false);
  }
}
