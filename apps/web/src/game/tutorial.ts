import type { GameState } from "@rt/sim";

/** Guided first minute (tutorial.md). */
export type TutorialStep = "buy" | "price" | "run" | "wait" | "report" | "done";

/** Steps the player sees, in order (for the "n / N" counter). */
export const TUTORIAL_STEPS: readonly Exclude<TutorialStep, "done">[] = Object.freeze([
  "buy",
  "price",
  "run",
  "wait",
  "report",
]);

export interface CoachText {
  readonly title: string;
  readonly body: string;
  /** Label of the "next" button, when the step is not completed by an action. */
  readonly next: string | null;
}

export const COACH: Readonly<Record<Exclude<TutorialStep, "done">, CoachText>> = Object.freeze({
  buy: {
    title: "Achetez votre première voiture",
    body: "Une citadine d'occasion suffit pour démarrer. Touchez « Acheter ».",
    next: null,
  },
  price: {
    title: "Fixez son prix",
    body: "Plus c'est cher, moins les clients acceptent. Le prix conseillé est un bon départ.",
    next: "Garder ce prix",
  },
  run: {
    title: "Lancez le temps",
    body: "Touchez « Reprendre » : l'agence ouvre à 9 h et les clients arrivent.",
    next: null,
  },
  wait: {
    title: "Vos voitures partent en location",
    body: "Chaque location remplit la caisse. Les charges sont payées à la fermeture, à 21 h.",
    next: null,
  },
  report: {
    title: "Lisez le bilan",
    body: "En haut : recettes, charges et résultat d'hier. Achetez, ajustez vos prix, améliorez l'agence !",
    next: "Compris",
  },
});

/** First step for a game: the tutorial only runs for a brand-new agency. */
export function initialTutorial(game: GameState): TutorialStep {
  return game.day === 0 && game.minute === 0 && game.fleet.length === 0 ? "buy" : "done";
}

/** Step after `step` when the player taps its "next" button. */
export function tutorialNext(step: TutorialStep): TutorialStep {
  switch (step) {
    case "price":
      return "run";
    case "report":
      return "done";
    default:
      return step;
  }
}
