# Revente + usure

Statut : approuvé (révision 1). Roadmap : « Avant le rendu », point 1.

## Règles (sim, pures, déterministes via `rng.ts`)

- **Identifiants** : `GameState.nextCarId` ; `buyCar` donne `nextCarId` puis l'incrémente. Un id n'est
  jamais réutilisé, même après une vente. `createGame` : `nextCarId = taille de la flotte + 1`.
- **Âge** : `Car.age` (jours possédés), +1 à chaque fermeture.
- **État** : `Car.condition` (0–100 %, 100 à l'achat). À chaque fermeture, chaque voiture louée ce
  jour-là perd `rng.int(2, 5)` points, une voiture restée au parking en perd 1 (minimum 0).
- **Pannes** : à l'ouverture (traitement de la minute 0, après le tirage des clients), chaque voiture
  non en panne tombe en panne avec la probabilité `(100 − condition) / 400` (0 % neuve, 25 % à 0 %).
  Une voiture en panne (`Car.broken`) ne part pas en location : issue `broken` (nouvelle valeur de
  `RentalOutcome`), pas de client consommé.
- **Réparer** `repairCar(state, carId)` : seulement si en panne ; coût `repairCost(car)` = 6 % du prix
  d'achat du modèle (arrondi à l'euro) ; la panne disparaît, l'état remonte à `max(condition, 50)`.
- **Entretien** `serviceCar(state, carId)` : remet l'état à 100 ; coût `serviceCost(car)` =
  `(100 − condition) × 0,3 %` du prix d'achat (arrondi à l'euro) ; refusé si déjà à 100 ou en panne
  (il faut réparer d'abord).
- **Revente** `sellCar(state, carId)` : crédite `resaleValue(car)` =
  `prix d'achat × max(20 %, 85 % − 0,4 % × âge) × (50 % + 50 % × condition / 100)`, arrondi à 100 € ;
  une voiture en panne vaut 60 % de cette valeur. Refusé tant que la voiture est en location (entre son
  départ et son retour de la journée en cours). La voiture disparaît de la flotte.
- Voitures sans modèle (fixtures de test) : prix d'achat de référence `FIXTURE_PURCHASE_PRICE = 4 000 €`.
- **Mécanicien** (nouvel employé `mechanic`, niveau 4, embauche 10 000 €, 100 €/jour) : à l'ouverture,
  répare les voitures en panne à **moitié prix** (payé en caisse) avant le premier départ, et fait
  l'entretien gratuit (main-d'œuvre) des voitures sous 40 % en ne payant que la moitié du coût.
- Erreurs typées : `CarNotBrokenError`, `CarBrokenError`, `CarInServiceError` (déjà à 100 %),
  `CarRentedOutError` (vente pendant la location), `UnknownCarError` existante.
- Sauvegarde : `GAME_STATE_VERSION = 10`, migration v9 → v10 : `nextCarId = max(id) + 1`, chaque
  voiture `age 0, condition 100, broken false`.

### Contrat (`packages/sim/src/wear.ts`, exporté par `index.ts`)

```ts
// Car gains OPTIONAL fields (absent = defaults): age?: number (0), condition?: number (100), broken?: boolean (false)
// RentalOutcome gains "broken". GameState gains nextCarId: number. ManagerId gains "mechanic".
export const FIXTURE_PURCHASE_PRICE: Cents;
export function carAge(car: Car): number; // 0 when absent
export function carCondition(car: Car): number; // 100 when absent
export function isBroken(car: Car): boolean; // false when absent
export function repairCost(car: Car): Cents;
export function serviceCost(car: Car): Cents; // 0 at 100 %
export function resaleValue(car: Car): Cents;
export function repairCar(state: GameState, carId: CarId): GameState;
export function serviceCar(state: GameState, carId: CarId): GameState;
export function sellCar(state: GameState, carId: CarId): GameState;
export function canSellNow(state: GameState, carId: CarId): boolean; // false while out on a rental
```

## UI (web)

- Ligne de voiture (« Ma flotte ») : âge (« 12 j »), barre d'état colorée (vert / orange / rouge),
  badge « En panne » (issue `broken`), boutons ronds « Réparer · X € » (si en panne), « Entretien · X € »
  (si < 100 %), « Vendre · X € » (confirmation : « Vendre la voiture n°3 pour 3 200 € ? »).
- Statut « Au parking · en panne » dans le badge et l'infobulle 3D.
- Employés : carte « Mécanicien ».
- Textes en français, cibles ≥ 44 px, aucun `NaN` / `undefined`.
