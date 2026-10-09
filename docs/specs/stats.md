# Statistiques

Statut : approuvé (révision 1). Roadmap : « Avant le rendu », point 2.

## Sim

- `GameState.history: readonly DayRecord[]` : à chaque fermeture, ajoute
  `{ day, revenue, costs, cash }` (jour clôturé, recettes, charges, caisse après la fermeture) ;
  ne garde que les **60 derniers** jours (`MAX_HISTORY_DAYS = 60`).
- `GameState.modelStats: Readonly<Record<string, { rentals: number; revenue: Cents }>>` : cumul
  par modèle (clé = id du modèle, `"other"` pour une voiture sans modèle), incrémenté à chaque
  location encaissée (revenu réellement encaissé, booster compris).
- Sauvegarde : `GAME_STATE_VERSION = 11`, migration v10 → v11 : `history = []`, `modelStats = {}`.

### Contrat (`packages/sim/src/stats.ts`, exporté par `index.ts`)

```ts
export interface DayRecord {
  readonly day: number;
  readonly revenue: Cents;
  readonly costs: Cents;
  readonly cash: Cents;
}
export interface ModelStat {
  readonly rentals: number;
  readonly revenue: Cents;
}
export const MAX_HISTORY_DAYS = 60;
// GameState gains: history: readonly DayRecord[]; modelStats: Readonly<Record<string, ModelStat>>;
export function modelStatKey(car: Car): string; // car.model ?? "other"
```

## UI

- Nouveau bouton rond « Stats » dans le menu latéral → panneau « Statistiques » :
  - courbe de la caisse (SVG, 30 derniers jours), axes simples, valeur actuelle ;
  - barres recettes / charges par jour (14 derniers jours) ;
  - tableau par modèle : locations, recettes, recette moyenne par location ; tri par recettes.
- Sans historique : message « Les statistiques arrivent après ta première journée. »
- Couleurs via tokens, aucun `NaN` / `undefined`, 390 px.
