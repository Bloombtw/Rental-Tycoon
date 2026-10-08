# Boucle de base (core loop) : une flotte, des locations, une caisse

Statut : **approuvé**, prêt à implémenter (révision 5).
Périmètre : `packages/sim` uniquement (+ tests Vitest). Pas d'UI, pas de serveur, pas de Playwright.

Décisions utilisateur intégrées :

1. Pas de revenu fixe : l'argent entre **uniquement** par les voitures louées.
2. `MAX_ADVANCE_DAYS = 3650` conservé comme plafond de `advance()`.
3. Charges fixes **par voiture** (chaque voiture a son propre coût journalier), pas de charge globale.
4. Trésorerie négative autorisée, sans faillite (confirmé).
5. La partie démarre **sans flotte** ; la première voiture sera achetée via le tutoriel (spec future).
6. Valeurs provisoires (section 3.2) approuvées comme **placeholders réglables**.
7. Erreurs typées dès maintenant pour `seed` et `startingCash` de `createGame`.
8. Règle de location : seuil de prix déterministe (option A) approuvé pour l'instant.

## 1. Fantasy

Chaque jour, mes voitures partent chez des clients et rapportent plus qu'elles ne coûtent : si je les ai bien tarifées, la caisse monte ; sinon elles dorment au parking et me ruinent.

## 2. Rules

### 2.1 Temps

- **1 tick = 1 jour simulé.** `day` part de `0` et augmente de exactement `1` par tick.

### 2.2 Flotte

- **En jeu, une partie démarre toujours avec une flotte vide** (`createGame(seed)` ou `createGame(seed, cash)`). Le paramètre optionnel `fleet` de `createGame` est un **point d'entrée de scénario / de test** (fixtures Vitest, futurs scénarios), **pas un chemin de gameplay** : aucune UI ni route serveur ne doit l'exposer au joueur. L'achat de voitures (et leur prix d'achat) est hors périmètre (section 9).
- Chaque voiture a :
  - `dailyPrice` : prix de location par jour (cents), fixé par le joueur à la création ;
  - `dailyCost` : charge fixe par jour (cents : assurance, parking, amortissement), payée **que la voiture soit louée ou non** ;
  - `rented` : la voiture a-t-elle été louée pendant le dernier jour simulé (`false` à la création).
- Les identifiants sont attribués par `createGame` : `id = index + 1` (1, 2, 3...), dans l'ordre du tableau fourni. L'ordre de la flotte est stable et n'est jamais modifié par la simulation.
- `createGame` ne copie **que** `dailyPrice` et `dailyCost` de chaque `NewCar` : toute autre propriété est ignorée et absente de l'état. Les propriétés héritées d'un prototype sont lues comme des accès de propriété normaux (`car.dailyPrice`).
- Un `seed` de `-0` est accepté et **normalisé en `+0`** dans l'état : `Object.is(createGame(-0).seed, 0)` et `rngState === 0`.
- Bornes de validation (`createGame`) :
  - `0 <= dailyPrice <= MAX_CAR_DAILY_PRICE` (`1_000_00`, soit 1 000,00 EUR/jour), entier sûr ;
  - `0 <= dailyCost <= MAX_CAR_DAILY_COST` (`1_000_00`), entier sûr ;
  - `0 <= fleet.length <= MAX_FLEET_SIZE` (`50`). Une flotte vide est valide.

### 2.3 Règle de location (déterministe, sans aléa)

Règle approuvée par l'utilisateur (option A, seuil de prix déterministe) pour cette version ; la demande tirée au sort reste une proposition (section 9).

- Seuil de prix client : `MAX_ACCEPTED_DAILY_PRICE = 150_00` (150,00 EUR/jour).
- **Chaque jour, chaque voiture dont `dailyPrice <= MAX_ACCEPTED_DAILY_PRICE` est louée pour la journée ; les autres restent au parking.** Une location dure exactement 1 jour (la voiture revient le soir et est de nouveau disponible le lendemain).
- Une voiture à `dailyPrice = 0` est louée mais ne rapporte rien (cas valide, pas d'erreur).
- Aucun tirage aléatoire : `rngState` n'est **ni lu ni modifié** par cette feature. C'est volontaire : la règle est un placeholder testable au centime près, que la future spec « demande client » remplacera par une demande tirée via `rng.ts` (voir section 9).

### 2.4 Tick : ordre exact

Pour `tick(state)` :

1. **Location** : pour chaque voiture, dans l'ordre de la flotte, `rented = (dailyPrice <= MAX_ACCEPTED_DAILY_PRICE)`.
2. **Comptes du jour** :
   - `revenue = somme des dailyPrice des voitures avec rented === true` ;
   - `costs = somme des dailyCost de toutes les voitures` ;
   - `net = revenue - costs` (calculé d'abord, puis ajouté) ;
   - `cash' = cash + net`.
3. `day' = day + 1`.
4. **Contrôle overflow** : si `cash'` n'est pas un `Number.isSafeInteger` (au-dessus de `MAX_SAFE_INTEGER`, en dessous de `MIN_SAFE_INTEGER`, `NaN`, flottant), lever `SimOverflowError` avec `field: "cash"` ; sinon si `day'` n'est pas un entier sûr, `field: "day"`. Même contrôle si `revenue`, `costs` ou `net` ne sont pas des entiers sûrs (état construit à la main et corrompu) : `field: "cash"`.
5. Renvoyer un **nouvel** état : `seed` et `rngState` recopiés, nouveau tableau `fleet` (nouvelles voitures avec `rented` à jour, `id`/`dailyPrice`/`dailyCost` recopiés).

Formule résultante : `cash' = cash + Σ(dailyPrice des louées) - Σ(dailyCost de toutes)`.

### 2.5 Trésorerie négative

- `cash` **peut devenir négatif**. Aucune faillite, aucun blocage dans cette feature : la simulation continue normalement (décision utilisateur confirmée ; la faillite éventuelle relèvera d'une spec dédiée).
- `createGame` continue d'exiger `startingCash >= 0`.

### 2.6 Avance rapide

- `advance(state, days)` est **observationnellement identique** à appliquer `tick` `days` fois (implémentation : boucle sur `tick`, pas de formule fermée).
- `days` valide ssi `Number.isSafeInteger(days) && days >= 0 && days <= MAX_ADVANCE_DAYS` (`3_650`). `-0` est traité comme `0`. `days = 0` (et `-0`) renvoie **la même référence** que l'entrée (`advance(g, 0) === g`) ; pour `days >= 1`, un nouvel objet est renvoyé.
- `days` est validé **avant** toute simulation.
- Un overflow pendant la boucle propage `SimOverflowError` ; aucun état partiel n'est exposé, l'entrée est intacte.

### 2.7 Repères d'équilibrage (indicatifs, non testés)

- Citadine type : `dailyPrice = 60_00`, `dailyCost = 25_00` : +35,00 EUR/jour.
- Voiture de luxe à `200_00`/jour : jamais louée avec la règle actuelle, donc perte sèche de son `dailyCost` chaque jour. Le joueur apprend immédiatement que le prix compte.

## 3. State

### 3.1 Types (dans `packages/sim/src/state.ts`)

```
type CarId = number            // entier >= 1, attribué par createGame

interface Car {
  readonly id: CarId
  readonly dailyPrice: Cents
  readonly dailyCost: Cents
  readonly rented: boolean      // loué pendant le dernier jour simulé
}

interface NewCar {              // entrée de createGame
  readonly dailyPrice: Cents
  readonly dailyCost: Cents
}

interface GameState {
  readonly seed: number
  readonly rngState: number
  readonly day: number
  readonly cash: Cents
  readonly fleet: readonly Car[]   // NOUVEAU (seul nouveau champ)
}
```

Accès compatible `noUncheckedIndexedAccess` : les consommateurs itèrent (`for...of`, `map`, `reduce`) ou utilisent `fleet[i]?.x`.

### 3.2 Signatures

| Nom                                                                                                                     | Fichier      | Type / signature                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `createGame` (modifié)                                                                                                  | `state.ts`   | `createGame(seed: number, startingCash: Cents = 50_000_00, fleet: readonly NewCar[] = []): GameState` |
| `tick` (modifié)                                                                                                        | `tick.ts`    | `tick(state: GameState): GameState`                                                                   |
| `advance` (nouveau)                                                                                                     | `tick.ts`    | `advance(state: GameState, days: number): GameState`                                                  |
| `MAX_ACCEPTED_DAILY_PRICE`                                                                                              | `economy.ts` | `Cents = 150_00`                                                                                      |
| `MAX_CAR_DAILY_PRICE`                                                                                                   | `economy.ts` | `Cents = 1_000_00`                                                                                    |
| `MAX_CAR_DAILY_COST`                                                                                                    | `economy.ts` | `Cents = 1_000_00`                                                                                    |
| `MAX_FLEET_SIZE`                                                                                                        | `economy.ts` | `number = 50`                                                                                         |
| `MAX_ADVANCE_DAYS`                                                                                                      | `economy.ts` | `number = 3_650`                                                                                      |
| `SimError`, `InvalidDaysError`, `SimOverflowError`, `InvalidFleetError`, `InvalidSeedError`, `InvalidStartingCashError` | `errors.ts`  | voir 3.3                                                                                              |

Les cinq constantes de `economy.ts` sont des **placeholders réglables** (valeurs approuvées pour cette version, susceptibles d'être rééquilibrées sans changer le contrat) ; le code et les tests doivent toujours s'y référer par leur nom, jamais par une valeur recopiée, sauf le test qui vérifie leur valeur. Il n'existe **pas** de `DAILY_INCOME`. Tout est réexporté par `packages/sim/src/index.ts`.

### 3.3 Erreurs typées (`packages/sim/src/errors.ts`)

Une base commune et cinq erreurs concrètes :

- `abstract class SimError extends RangeError` avec `readonly code: SimErrorCode`, où `SimErrorCode = "INVALID_DAYS" | "SIM_OVERFLOW" | "INVALID_FLEET" | "INVALID_SEED" | "INVALID_STARTING_CASH"`. Étendre `RangeError` garde la compatibilité avec les `toThrow(RangeError)` existants.
- `InvalidDaysError extends SimError` : `name = "InvalidDaysError"`, `code = "INVALID_DAYS"`, `readonly days: unknown` (valeur reçue telle quelle).
- `SimOverflowError extends SimError` : `name = "SimOverflowError"`, `code = "SIM_OVERFLOW"`, `readonly field: "cash" | "day"`.
- `InvalidFleetError extends SimError` : `name = "InvalidFleetError"`, `code = "INVALID_FLEET"`, `readonly index: number | null` (index de la voiture fautive, `null` si c'est le tableau lui-même), `readonly field: "fleet" | "dailyPrice" | "dailyCost"`.

- `InvalidSeedError extends SimError` : `name = "InvalidSeedError"`, `code = "INVALID_SEED"`, `readonly seed: unknown` (valeur reçue telle quelle). Levée par `createGame` si `!Number.isSafeInteger(seed)`.
- `InvalidStartingCashError extends SimError` : `name = "InvalidStartingCashError"`, `code = "INVALID_STARTING_CASH"`, `readonly startingCash: unknown` (valeur reçue telle quelle). Levée par `createGame` si `!Number.isSafeInteger(startingCash) || startingCash < 0`.

`instanceof` doit fonctionner pour la classe concrète, `SimError` et `RangeError` (les assertions `toThrow(RangeError)` de `sim.test.ts` restent vertes).

Ordre de validation de `createGame` : `seed`, puis `startingCash`, puis `fleet` ; seule la première erreur est levée. Les règles de validité de `seed` et `startingCash` sont inchangées (seul le type d'erreur change). `startingCash` passé explicitement à `undefined` prend la valeur par défaut (comportement standard des paramètres par défaut JS).

## 4. Player actions

Pas d'UI : les « actions » sont les appels d'API sim, traités comme des entrées non fiables.

| Appel                                   | Préconditions                   | Cas invalides et résultat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createGame(seed, startingCash, fleet)` | voir 2.2                        | `seed` non entier sûr (`NaN`, `1.5`, `±Infinity`, `2 ** 53`, non-number) : `InvalidSeedError`. `startingCash` négatif, non entier, `NaN`, `±Infinity`, `> MAX_SAFE_INTEGER`, non-number (`"100"`, `null`) : `InvalidStartingCashError`. `fleet` non tableau (`null`, objet, chaîne) : `InvalidFleetError` (`index: null`, `field: "fleet"`). `fleet.length > 50` : idem. Élément non objet ou `null` : `InvalidFleetError` (`index: i`, `field: "dailyPrice"`). `dailyPrice` négatif, flottant, `NaN`, `±Infinity`, non-number, absent, `> 1_000_00` : `field: "dailyPrice"`. Même liste pour `dailyCost` : `field: "dailyCost"`. Le premier défaut rencontré (ordre de la flotte, `dailyPrice` avant `dailyCost`) est signalé. |
| `tick(state)`                           | `state` est un `GameState`      | `cash'` ou `day'` non entier sûr (overflow positif ou négatif, état corrompu) : `SimOverflowError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `advance(state, days)`                  | `0 <= days <= 3650`, entier sûr | négatif, non entier, `NaN`, `±Infinity`, `> 3650`, `2 ** 53`, non-number (`"3"`, `null`, `undefined`, `3n`, `{}`) : `InvalidDaysError`. Overflow pendant la boucle : `SimOverflowError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

`createGame` ne conserve aucune référence aux objets `NewCar` fournis (copie) : muter le tableau d'entrée après coup n'affecte pas l'état. Seuls `dailyPrice` et `dailyCost` sont copiés (propriétés supplémentaires ignorées, propriétés héritées lues normalement).

Les contrôles sur le tableau `fleet` (non tableau, `length > MAX_FLEET_SIZE`) passent **avant** tout contrôle d'élément : une flotte de 51 voitures contenant aussi une voiture invalide lève `InvalidFleetError` avec `{ index: null, field: "fleet" }`.

## 5. UI

Hors périmètre. Note pour la future spec HUD : « Jour N », caisse en euros (rouge si négative), liste de la flotte avec badge « Louée » / « Au parking ».

## 6. Server

Hors périmètre. Note : `GameState` gagne `fleet`, la future spec de sauvegarde devra le valider (zod) avec les mêmes bornes que `createGame`.

## 7. Acceptance criteria

Tous testables avec `npx vitest run --project sim`. Flottes de référence :

- `PROFITABLE = [{ dailyPrice: 60_00, dailyCost: 25_00 }, { dailyPrice: 90_00, dailyCost: 40_00 }]` : net `+85_00`/jour.
- `IDLE = [{ dailyPrice: 200_00, dailyCost: 30_00 }, { dailyPrice: 160_00, dailyCost: 20_00 }]` : aucune location, net `-50_00`/jour.
- `MIXED = [{ dailyPrice: 100_00, dailyCost: 30_00 }, { dailyPrice: 300_00, dailyCost: 50_00 }]` : 1 louée, net `+20_00`/jour.

Exports

- [ ] Les constantes de 3.2 ont exactement les valeurs indiquées ; `DAILY_INCOME` n'est pas exporté.
- [ ] `createGame`, `tick`, `advance`, `SimError`, `InvalidDaysError`, `SimOverflowError`, `InvalidFleetError`, `InvalidSeedError`, `InvalidStartingCashError` sont importables depuis `./index.js`.

`createGame`

- [ ] `createGame(1)` a `fleet` deep-equal `[]` ; `tick` sur cet état laisse `cash` inchangé et fait `day + 1`.
- [ ] `createGame(1, C, PROFITABLE).fleet` deep-equal `[{ id: 1, dailyPrice: 60_00, dailyCost: 25_00, rented: false }, { id: 2, dailyPrice: 90_00, dailyCost: 40_00, rented: false }]`.
- [ ] Muter le tableau ou les objets passés à `createGame` après l'appel ne modifie pas l'état.
- [ ] Accepte `dailyPrice`/`dailyCost` à `0` et à `1_000_00`, et une flotte de 50 voitures.
- [ ] Lève `InvalidFleetError` (avec `index` et `field` attendus, `instanceof SimError` et `RangeError`) pour : 51 voitures ; `fleet` = `null` / `{}` / `"x"` ; élément `null` ; `dailyPrice` dans `{-1, 1.5, NaN, Infinity, 1_000_01, "100", undefined}` ; même liste pour `dailyCost`.
- [ ] `createGame(1)` et `createGame(1, 1000)` ont une flotte vide (démarrage de partie standard).
- [ ] `createGame(x)` lève `InvalidSeedError` (code `"INVALID_SEED"`, `seed` égal via `Object.is` à `x`, `instanceof SimError` et `RangeError`) pour `x` dans `{NaN, 1.5, Infinity, -Infinity, 2 ** 53, "1", null, undefined}`. `createGame(-1)`, `createGame(0)` et `createGame(Number.MAX_SAFE_INTEGER)` réussissent.
- [ ] `createGame(-0)` réussit avec `Object.is(state.seed, 0) === true` (normalisé en `+0`) et `state.rngState === 0`.
- [ ] `createGame(1, x)` lève `InvalidStartingCashError` (code `"INVALID_STARTING_CASH"`, `startingCash` égal via `Object.is` à `x`, `instanceof SimError` et `RangeError`) pour `x` dans `{-1, 10.5, NaN, Infinity, -Infinity, 2 ** 53, "100", null}`. `createGame(1, 0)` et `createGame(1, Number.MAX_SAFE_INTEGER)` réussissent ; `createGame(1, undefined).cash === 50_000_00`.
- [ ] Ordre de validation : `createGame(NaN, -1, null)` lève `InvalidSeedError` ; `createGame(1, -1, null)` lève `InvalidStartingCashError`.
- [ ] Les assertions existantes de `sim.test.ts` (`toThrow(RangeError)` pour `seed` NaN, `startingCash` -1 ou 10.5) restent vertes sans modification.

`tick` et revenus

- [ ] Revenus > coûts : pour `PROFITABLE`, `cash` est strictement croissant jour après jour, et `advance(createGame(s, C, PROFITABLE), N).cash === C + N * 85_00` pour N dans `{1, 30, 365, 3650}`.
- [ ] Aucune location : pour `IDLE`, `advance(createGame(s, C, IDLE), N).cash === C - N * 50_00` (= C - N × somme des coûts), y compris quand le résultat est négatif (ex. `C = 0`, `N = 10` donne `-500_00`, sans erreur).
- [ ] Mixte : pour `MIXED`, après 1 tick, `fleet[0].rented === true`, `fleet[1].rented === false`, `cash === C + 20_00`.
- [ ] Seuil : une voiture à `dailyPrice = 150_00` est louée, à `150_01` ne l'est pas.
- [ ] Une voiture à `dailyPrice = 0, dailyCost = 10_00` est louée et fait perdre `10_00`/jour.
- [ ] `seed` et `rngState` identiques avant/après `tick` et `advance` ; `id`, `dailyPrice`, `dailyCost` et l'ordre de la flotte inchangés.
- [ ] Immuabilité : `tick` et `advance` sur un état gelé en profondeur (état + tableau + voitures) ne lèvent pas et l'entrée reste deep-equal à sa copie ; `tick` renvoie un objet et un tableau `fleet` différents (`!==`).

Déterminisme

- [ ] Deux appels `advance(createGame(42, C, MIXED), 100)` donnent des états deep-equal.
- [ ] Deux seeds différents avec la même flotte donnent la même `cash` et la même `fleet` (la règle actuelle ne dépend pas du hasard).

`advance`

- [ ] `advance(g, N)` deep-equal `tick` appliqué N fois (plusieurs N, flottes, seeds).
- [ ] Composition : `advance(advance(g, a), b)` deep-equal `advance(g, a + b)` pour `a + b <= 3650`.
- [ ] `advance(g, 0) === g` et `advance(g, -0) === g` (même référence) ; `advance(g, 1) !== g`.
- [ ] `InvalidDaysError` (code `"INVALID_DAYS"`, `days` égal via `Object.is` à l'entrée) pour `{-1, 1.5, NaN, Infinity, -Infinity, 3651, 2 ** 53, Number.MAX_VALUE}` et pour `{"3", null, undefined, 3n, {}, []}`.
- [ ] Un `days` invalide sur un état qui déborderait lève `InvalidDaysError` (validation d'abord).
- [ ] `advance(g, 3650)` avec 50 voitures termine sous le timeout Vitest par défaut.

Overflow

- [ ] `createGame(1, Number.MAX_SAFE_INTEGER - 2 * 85_00, PROFITABLE)` : `advance(…, 2)` réussit (cash `=== MAX_SAFE_INTEGER`), `advance(…, 3)` lève `SimOverflowError` (`field: "cash"`) et l'entrée est intacte.
- [ ] Overflow négatif : état construit à la main `{ ...createGame(1, 0, IDLE), cash: Number.MIN_SAFE_INTEGER + 50_00 }` : un tick réussit (cash `=== MIN_SAFE_INTEGER`), le suivant lève `SimOverflowError` (`field: "cash"`).
- [ ] État construit à la main avec `cash: NaN` ou `0.5`, ou une voiture avec `dailyCost: NaN` : `tick` lève `SimOverflowError` (`field: "cash"`).
- [ ] État construit à la main avec `day: Number.MAX_SAFE_INTEGER` : `tick` lève `SimOverflowError` (`field: "day"`).

Non-régression

- [ ] `sim.test.ts` existant reste vert ; `npm run check` vert.

## 8. Split

sim-engineer et qa-breaker **en parallèle** (les sections 2 à 4 sont le contrat), puis reviewer.

1. **sim-engineer** (`packages/sim/src`)
   1. `errors.ts` : `SimError`, `InvalidDaysError`, `SimOverflowError`, `InvalidFleetError`, `InvalidSeedError`, `InvalidStartingCashError` ; remplacer les `RangeError` de `createGame` par ces deux dernières.
   2. `economy.ts` : les cinq constantes.
   3. `state.ts` : `CarId`, `Car`, `NewCar`, champ `fleet`, `createGame` avec validation et copie de la flotte.
   4. `tick.ts` : nouveau `tick` (ordre 2.4) et `advance` (boucle sur `tick`).
   5. Réexports dans `index.ts`.
2. **qa-breaker** (`packages/sim/src/core-loop.test.ts`, Vitest uniquement) : tous les critères de la section 7, imports depuis `./index.js` uniquement, plus des attaques supplémentaires déterministes (pas de `Math.random`).
3. **reviewer** : conformité au contrat (noms, valeurs, ordre des étapes du tick, ordre de validation, immuabilité, pureté), `npm run check` vert.

Hors périmètre : `apps/web`, `apps/server`, `e2e/`.

## 9. Proposals / out of scope

Rien de ce qui suit n'est à implémenter sans une spec dédiée validée :

- **Achat de la première voiture via le tutoriel** : la partie démarre sans flotte, le tutoriel guide le joueur vers son premier achat (s'appuie sur `buyCar`).
- **Achat de voitures** (`buyCar` avec prix d'achat en cents, débité de la caisse ; revente). Nécessitera un champ `nextCarId` ou un calcul `max(id) + 1`.
- **Changement de prix en jeu** (`setCarPrice`), base de la spec « tarification ».
- **Demande client tirée au sort** : nombre de clients par jour et probabilité d'acceptation décroissante avec le prix, via `rng.ts` et `rngState` ; remplacera le seuil fixe `MAX_ACCEPTED_DAILY_PRICE`.
- **Locations de plusieurs jours** (`rentedDaysLeft` par voiture) : utile seulement quand la demande sera limitée.
- **Faillite** : par exemple game over après 30 jours consécutifs de caisse négative, ou découvert autorisé avec agios.
- **Rapport du jour** (`lastDay: { revenue, costs }` dans l'état) pour le HUD.
- **Entretien, usure, événements** : rendront une voiture indisponible (statut supplémentaire).
- Validation complète d'un GameState chargé (sauvegarde) : une fonction sim `validateGameState`, partagée par le serveur et éventuellement `tick`, pour rejeter les voitures corrompues (prix NaN/négatif…) ; aujourd'hui `tick` ne valide que les sommes.
- Exceptions levées par des getters sur les NewCar : à typer si fleet devient un chemin non fiable.
