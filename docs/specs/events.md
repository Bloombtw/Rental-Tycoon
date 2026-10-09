# Événements

Statut : approuvé (révision 1). Roadmap : Phase 3, point 2.

## Règles (sim, pures, déterministes via `rng.ts`)

| `kind`     | Nom (UI)             | Effet pendant l'événement                                          | Durée (jours) | Poids |
| ---------- | -------------------- | ------------------------------------------------------------------ | ------------- | ----- |
| `holidays` | Vacances scolaires   | Clients du jour × 2 (`demandPct: 200`)                             | 2–4           | 3     |
| `carShow`  | Salon de l'auto      | Prix de référence + 30 % (`referencePct: 130`)                     | 1–2           | 2     |
| `strike`   | Grève des transports | Clients du jour × 1,5 (`demandPct: 150`) : plus besoin de voitures | 1–2           | 2     |
| `storm`    | Tempête              | Clients du jour × 0,4 (`demandPct: 40`)                            | 1             | 2     |

- À l'ouverture d'une journée (traitement de la minute 0), **avant** le tirage des clients : si aucun événement n'est actif et `day >= nextEventDay`, un événement est tiré au sort (pondéré) avec une durée tirée dans son intervalle ; il est actif pour les jours `[startDay, endDay)`. À sa fin (`day >= endDay`), il est effacé et `nextEventDay = day + rng.int(4, 9)`.
- Effets appliqués pendant `startDay <= day < endDay` :
  - clients du jour : `round(clientsCalculés × demandPct / 100)` (après publicité / commercial / booster) ;
  - prix de référence : `round(référence × referencePct / 100)` (après la station de lavage).
- Nouvelle partie : `event = null`, `nextEventDay = 3`.
- Sauvegarde : `GAME_STATE_VERSION = 9`, migration v8 → v9 : `event = null`, `nextEventDay = day + 3`.

### Contrat (`packages/sim/src/events.ts`, exporté par `index.ts`)

```ts
export type EventKind = "holidays" | "carShow" | "strike" | "storm";
export const EVENT_KINDS: readonly EventKind[]; // ["holidays", "carShow", "strike", "storm"]
export interface EventSpec {
  readonly kind: EventKind;
  readonly demandPct: number; // 100 = no change
  readonly referencePct: number; // 100 = no change
  readonly minDays: number;
  readonly maxDays: number;
  readonly weight: number;
}
export const EVENTS: Readonly<Record<EventKind, EventSpec>>;
export interface ActiveEvent {
  readonly kind: EventKind;
  readonly startDay: number;
  readonly endDay: number; // exclusive
}
// GameState gains: readonly event: ActiveEvent | null; readonly nextEventDay: number;
export function activeEvent(state: GameState): ActiveEvent | null; // event if startDay <= day < endDay
export function eventDaysLeft(state: GameState): number; // endDay - day, or 0
export function eventDemandPct(state: GameState): number; // 100 when none
export function eventReferencePct(state: GameState): number; // 100 when none
```

## UI (web)

- Au début d'un événement (en jeu actif) : bannière « Événement : Vacances scolaires — clients × 2 pendant 3 jours » (même place que la bannière de nouveau jour, avec une icône), qui se ferme d'un tap ou seule.
- Pendant l'événement : pastille dans le HUD (icône + nom court + « 2 j ») ; tap = rappel de l'effet.
- Textes en français, icônes rondes cohérentes avec le menu latéral.
