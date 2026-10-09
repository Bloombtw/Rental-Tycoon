# Tutoriel forcé avec René, l'ancien gérant

Statut : approuvé (révision 2, remplace la révision 1). Roadmap : « Prioritaire », point 1.

René part à la retraite et te confie les clés de l'agence. Il te guide pas à pas ; tant que le
tutoriel tourne, seule l'action demandée est possible.

## Personnage

- **Portrait** en bas de l'écran : modèle Kenney `characters/character-male-*` rendu hors écran (même
  pipeline que les vignettes de voitures) ; à défaut (pas de WebGL, échec), un portrait SVG soigné.
  Il respire (léger mouvement vertical) et hoche la tête pendant que le texte s'écrit.
- **Bulle** : texte écrit lettre par lettre ; un tap affiche tout, un second tap passe à la bulle
  suivante. Ton chaleureux et un peu bourru, tutoiement.
- **Dans la scène 3D** : René attend devant l'agence (animation `idle`), fait `emote-yes` à chaque
  étape réussie, et s'éloigne à pied à la fin (`walk`, puis disparaît).

## Guidage forcé

- **Calque sombre** sur tout l'écran avec un **spotlight** arrondi et animé autour de la cible ; tout
  le reste est bloqué (les taps hors du spotlight ne passent pas). Pendant les bulles sans action,
  tout le jeu est bloqué et un tap fait avancer René.
- **Grosse flèche** qui rebondit vers la cible :
  - cible DOM : l'élément `[data-tutorial="<id>"]`, mesuré en continu (il peut bouger, défiler) ;
  - cible 3D : une voiture qui part, projetée à l'écran et suivie avec la caméra.
- **Jamais d'étape sans issue** : si la cible est cachée (menu fermé, tiroir replié), René fait
  d'abord ouvrir le bon menu (sous-étape « ouvre… »), puis montre la cible.
- **Pas de « Passer »** pendant la première partie. Réglages → « Revoir le tutoriel » le relance
  (une partie déjà avancée peut alors le passer).

## Étapes (validées par l'action réelle)

| Id             | Ce que dit René (résumé)                                                | Cible (`data-tutorial`)       | Avance quand…                        |
| -------------- | ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------ |
| `welcome`      | 3 bulles : présentation, il prend sa retraite, il te montre le métier   | aucune (René)                 | tap après la dernière bulle          |
| `openCars`     | « Une agence sans voiture… ouvre le garage. »                           | `rail-cars`                   | menu Voitures ouvert                 |
| `buyUsed`      | « Prends la citadine d'occasion, c'est du solide. »                     | `buy-used`                    | une voiture achetée                  |
| `openFleet`    | « Viens voir ta flotte. » (seulement si le tiroir est replié)           | `drawer-handle`               | tiroir de la flotte ouvert           |
| `setPrice`     | « Le prix, c'est toi qui décides. 90 €, c'est honnête. »                | `price-editor`                | un prix appliqué (même inchangé)     |
| `startTime`    | « Ouvre la boutique : lance le temps. »                                 | `speed-pause`                 | le temps tourne                      |
| `speedUp`      | « Ça traîne ! Accélère un peu. »                                        | `speed-fast` (x2 / x4)        | vitesse ≥ x2                         |
| `watchCar`     | « Regarde, un client part avec ta voiture… » puis commente le « +X € »  | voiture qui part (3D)         | un départ en location, puis tap      |
| `openUpgrades` | « Une agence, ça s'entretient. Ouvre les améliorations. »               | `rail-upgrades`               | menu Agence ouvert                   |
| `buyUpgrade`   | « Commence par la publicité. » (cadeau de bienvenue si l'argent manque) | `upgrade-buy-ads`             | une amélioration achetée             |
| `missions`     | 2 bulles : les missions, la récompense quotidienne                      | `rail-missions`               | tap après la dernière bulle          |
| `dayEnd`       | « Laisse tourner jusqu'à la fermeture, je reste là. »                   | aucune (jeu libre sauf menus) | première journée clôturée            |
| `goodbye`      | bilan de la journée (chiffres réels), au revoir ; René s'en va          | `hud-report`                  | tap après la dernière bulle → `done` |

- Vitesses du jeu : x1, x2, x4, x10 ; « x2 ou x5 » de la roadmap = toute vitesse ≥ x2.
- Cadeau de bienvenue (`buyUpgrade`) : si la caisse ne couvre pas la publicité, René offre la
  différence (`giveWelcomeGift` dans la sim, une seule fois).
- Pendant `dayEnd`, le temps tourne librement mais les menus restent bloqués.

## Technique

- **Logique pure et testée** (`apps/web/src/game/tutorial.ts`) : `étape + événement → étape suivante`,
  et le script (bulles, cible, attente) de chaque étape.
- **Étape sauvegardée avec l'autosave** (enveloppe de sauvegarde) : un rechargement reprend au même
  endroit (une étape « en attente d'action » dont l'action est déjà faite avance aussitôt).
- **Pas d'événements ni de pop-ups pendant le tutoriel** : récompense du jour, gains hors ligne,
  bannière d'événement, boutique automatique : mis en file et montrés après `done`.
- **Le tutoriel ne s'affiche pas pour une sauvegarde existante** (enveloppe sans champ `tutorial`
  → `done`). Il démarre pour une nouvelle partie.
- Mobile 390 px, cibles ≥ 44 px, `prefers-reduced-motion` : pas d'animation de spotlight, de flèche ni
  de respiration ; texte affiché d'un coup.

## Contrat entre la logique et l'affichage

```ts
// apps/web/src/game/tutorial.ts (logique, pur)
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
export function nextTutorialStep(step: TutorialStep, event: TutorialEvent): TutorialStep;
export function tutorialScript(
  step: TutorialStep,
  ctx: { lastGain: number | null; report: { revenue: number; costs: number } | null },
): TutorialScript;

// apps/web/src/components/tutorial/TutorialOverlay.tsx (affichage)
interface TutorialOverlayProps {
  readonly step: Exclude<TutorialStep, "done">;
  readonly script: TutorialScript;
  readonly carTarget: { x: number; y: number } | null; // screen px, for target.kind === "car"
  readonly canSkip: boolean;
  readonly onTap: () => void; // bubble finished and tapped (sends { type: "tap" })
  readonly onSkip: () => void;
}
// AgencyScene3D: setRene(mode: "hidden" | "idle" | "cheer" | "leave"); AgencyView prop
// onDepartingCar?: (p: { x: number; y: number } | null) => void (screen position of a car leaving).
```

## Argent (révision 2.1)

- Une **nouvelle partie démarre à 0 €** : c'est René qui finance le départ. Les sauvegardes existantes
  gardent leur caisse.
- `openCars` : René complète la caisse jusqu'à **5 000 €** (de quoi acheter la citadine d'occasion à
  4 000 €) et l'annonce dans sa bulle.
- `buyUpgrade` : s'il manque de quoi payer la publicité, René complète (cadeau de bienvenue).
- Fin du tutoriel (`goodbye` → `done`) : **20 000 €** de fonds de roulement.
- Chaque don ne peut tomber qu'une fois (calculé d'après la caisse, ou sur la transition de fin) ;
  rien pendant un « Revoir le tutoriel ».
