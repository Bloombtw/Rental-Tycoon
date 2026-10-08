# Première partie jouable : acheter, tarifer, passer au jour suivant

Statut : **approuvé**, prêt à implémenter (révision 3).
Prérequis : `docs/specs/core-loop.md` (rév. 5, fusionnée dans `main` via la PR #1). Cette spec réalise les points « Achat de voitures », « Changement de prix en jeu » et « Rapport du jour » de la section 9 de core-loop, et remplace le « tutoriel » par un simple message d'accueil.
Périmètre : `packages/sim` (actions pures) + `apps/web` (HUD React). **Aucun travail serveur.** Pas de vue PixiJS. Pas de Playwright.

Décisions déjà prises (core-loop, non rediscutées) : 1 tick = 1 jour ; la partie démarre sans flotte ; règle de location A (`dailyPrice <= MAX_ACCEPTED_DAILY_PRICE` donc louée chaque jour) ; charges fixes par voiture ; trésorerie négative autorisée sans faillite ; le paramètre `fleet` de `createGame` reste un point d'entrée de test, jamais exposé au joueur.

Décisions utilisateur intégrées (révision 2) :

1. Avec la règle A, 150,00 € est toujours le prix optimal : accepté pour cette version. La spec « demande client » vient ensuite (reste en section 9).
2. Pas d'achat à crédit pour l'instant : achat refusé si la caisse deviendrait négative.
3. La partie est perdue au rechargement de la page tant qu'aucune spec sauvegarde / chargement n'existe.
4. Le HUD affiche « Jour {day + 1} ».
5. Pas de `@testing-library` : les tests DOM web utilisent `createRoot` + `act` de React, avec des requêtes par `data-testid`, `role` et `label`.
6. Les valeurs des modèles de voiture sont des placeholders réglables.

## 1. Fantasy

J'ouvre mon agence avec un parking vide et 50 000 € en poche : je choisis mes premières voitures, je fixe leur prix, je passe au jour suivant et je vois tout de suite si ma caisse monte ou si mes voitures dorment au parking.

## 2. Rules

### 2.1 Catalogue de modèles (`economy.ts`)

Le joueur ne saisit jamais un coût : il choisit un **modèle** dans un catalogue fixe. Trois modèles, valeurs **placeholders réglables** (toujours référencées par leur nom dans le code et les tests, sauf le test qui vérifie les valeurs) :

| `CarModelId` | Libellé UI (web)        | `purchasePrice` | `dailyCost` | `defaultDailyPrice` | Marge/jour au prix par défaut | Marge/jour à 150,00 € |
| ------------ | ----------------------- | --------------- | ----------- | ------------------- | ----------------------------- | --------------------- |
| `"used"`     | « Citadine d'occasion » | `4_000_00`      | `60_00`     | `90_00`             | +30,00 €                      | +90,00 €              |
| `"compact"`  | « Citadine neuve »      | `9_000_00`      | `25_00`     | `60_00`             | +35,00 €                      | +125,00 €             |
| `"hybrid"`   | « Berline hybride »     | `16_000_00`     | `10_00`     | `120_00`            | +110,00 €                     | +140,00 €             |

Ordre d'affichage canonique : `CAR_MODEL_IDS = ["used", "compact", "hybrid"]`.

Invariants (testés) pour chaque modèle : `purchasePrice` entier sûr `> 0` ; `0 <= dailyCost <= MAX_CAR_DAILY_COST` ; `0 <= defaultDailyPrice <= MAX_ACCEPTED_DAILY_PRICE` ; `defaultDailyPrice > dailyCost` (un modèle acheté et laissé au prix par défaut est rentable avec la règle A).

**Pourquoi ces valeurs (profondeur)** : le choix oppose **capital immobilisé** et **coût de fonctionnement**, deux contraintes qui s'activent à des moments différents de la partie :

- Début de partie, contrainte = **caisse** (achat refusé si fonds insuffisants, 2.2). Avec 50 000 € : 12 occasions (+1 080 €/jour à 150 €) contre 5 neuves (+625 €/jour) ou 3 hybrides (+420 €/jour). L'occasion a le meilleur rendement par euro investi.
- Fin de partie, contrainte = **places** (`MAX_FLEET_SIZE = 50`, pas de revente dans cette version). L'hybride a la meilleure marge par place. Chaque place occupée par une occasion est un choix définitif.
- Point de bascule à 150 € : neuve contre occasion après 143 jours (`5 000 € / 35 €`), hybride contre neuve après 467 jours.
- Le prix par défaut est volontairement **sous** l'optimum : le joueur découvre qu'il peut monter son prix, et qu'au-delà de 150,00 € la voiture reste au parking (badge « Au parking » le lendemain) tout en coûtant ses charges.

Note honnête : avec la règle A, le prix optimal est toujours exactement `MAX_ACCEPTED_DAILY_PRICE`. C'est assumé pour cette version ; la future spec « demande client » rendra le prix réellement arbitrable (section 9).

### 2.2 Achat (`buyCar`)

- `buyCar(state, model)` ajoute **en fin de flotte** une voiture neuve :
  `{ id, model, dailyPrice: CAR_MODELS[model].defaultDailyPrice, dailyCost: CAR_MODELS[model].dailyCost, rented: false }`.
- `cash' = cash - purchasePrice`. L'achat est débité **immédiatement** (entre deux jours) ; il n'apparaît pas dans `lastDay`.
- **Achat refusé si la caisse deviendrait négative** : il faut `cash >= purchasePrice`. `cash === purchasePrice` est autorisé (caisse à 0). Une caisse déjà négative interdit tout achat. Il n'y a pas de crédit dans cette version : le découvert ne peut venir que des charges journalières.
- Refusé si `fleet.length >= MAX_FLEET_SIZE`.
- La voiture achetée n'est pas louée le jour de l'achat (`rented: false`) ; elle participe au prochain `tick` comme les autres (louée si son prix `<= MAX_ACCEPTED_DAILY_PRICE`, et ses `dailyCost` sont dus dès ce tick).
- `day`, `seed`, `rngState`, `lastDay` et les voitures existantes sont recopiés inchangés. `rngState` n'est ni lu ni modifié.

### 2.3 Attribution des identifiants

- `id = max(id de la flotte) + 1`, ou `1` si la flotte est vide. Pas de nouveau champ `nextCarId` dans l'état.
- Sans revente, c'est équivalent à `fleet.length + 1` pour une partie normale, et ça reste correct pour une flotte de fixture aux ids non contigus (ex. ids `[5, 2]` donnent `6`).
- Limite connue (à reprendre dans la spec revente) : si la voiture d'id maximal est un jour vendue, son id serait réutilisé. Sans revente, le cas n'existe pas.
- Si l'id calculé n'est pas un entier sûr (`NaN`, ids corrompus, `max = MAX_SAFE_INTEGER`) : `SimOverflowError` avec `field: "carId"`.

### 2.4 Changement de prix (`setCarPrice`)

- `setCarPrice(state, carId, dailyPrice)` remplace le `dailyPrice` de la **première** voiture dont `id === carId` (comparaison stricte). Tout le reste est recopié inchangé, y compris `rented` de cette voiture (qui décrit toujours le dernier jour simulé) et `lastDay`.
- Bornes : `Number.isSafeInteger(dailyPrice) && 0 <= dailyPrice <= MAX_CAR_DAILY_PRICE` (mêmes bornes que `createGame`). `0` est valide (voiture louée gratuitement). `-0` est accepté et **normalisé en `+0`** dans l'état (même normalisation que le `seed` dans core-loop).
- Le nouveau prix prend effet au prochain `tick`. Changer le prix est gratuit et illimité.
- Renvoie **toujours un nouvel objet** état et un nouveau tableau `fleet`, même si le prix est identique.

### 2.5 Rapport du dernier jour (`lastDay`)

- `GameState` gagne `lastDay: DayReport | null`, avec `DayReport = { revenue, costs }` (cents).
- `createGame` le met à `null` (aucun jour simulé).
- `tick` le remplit avec le `revenue` et les `costs` calculés à l'étape 2 de core-loop §2.4 (le `net` reste `revenue - costs`). Les contrôles d'overflow de core-loop §2.4 sont inchangés ; `lastDay` n'est écrit que si le tick réussit.
- `buyCar` et `setCarPrice` le recopient sans le modifier.
- `advance(g, 0)` renvoie toujours la même référence (core-loop inchangé).

### 2.6 Modifications de `tick` (core-loop §2.4 étape 5)

Le nouvel état renvoyé contient en plus `lastDay: { revenue, costs }`. Chaque voiture recopiée garde sa propriété `model` **si et seulement si** elle est présente sur la voiture d'entrée (`"model" in car`) ; les voitures de fixture créées par `createGame` n'en ont pas et n'en gagnent pas.

### 2.7 Validation : ordres exacts

- `buyCar` : (1) `model` doit être une clé **propre** de `CAR_MODELS` (`typeof model === "string" && Object.hasOwn(CAR_MODELS, model)`), sinon `UnknownCarModelError` ; (2) `fleet.length >= MAX_FLEET_SIZE` donne `FleetFullError` ; (3) `cash` non entier sûr (état corrompu) donne `SimOverflowError("cash")` ; (4) `cash < purchasePrice` donne `InsufficientCashError` ; (5) id calculé non entier sûr donne `SimOverflowError("carId")`. Seule la première erreur est levée.
- `setCarPrice` : (1) aucune voiture avec `id === carId` donne `UnknownCarError` ; (2) prix hors bornes donne `InvalidPriceError`.

## 3. State

### 3.1 Types sim

Dans `packages/sim/src/economy.ts` :

```
type CarModelId = "used" | "compact" | "hybrid"

interface CarModel {
  readonly id: CarModelId
  readonly purchasePrice: Cents
  readonly dailyCost: Cents
  readonly defaultDailyPrice: Cents
}

const CAR_MODEL_IDS: readonly CarModelId[]                        // ["used", "compact", "hybrid"], gelé
const CAR_MODELS: Readonly<Record<CarModelId, CarModel>>          // valeurs 2.1, gelé en profondeur (Object.freeze)
```

Dans `packages/sim/src/state.ts` (modifié) :

```
interface Car {
  readonly id: CarId
  readonly model?: CarModelId     // NOUVEAU, optionnel : présent pour toute voiture achetée ; absent pour les fixtures createGame
  readonly dailyPrice: Cents
  readonly dailyCost: Cents
  readonly rented: boolean
}

interface DayReport {             // NOUVEAU
  readonly revenue: Cents         // somme des dailyPrice des voitures louées pendant le dernier jour
  readonly costs: Cents           // somme des dailyCost de toute la flotte pendant le dernier jour
}

interface GameState {
  readonly seed: number
  readonly rngState: number
  readonly day: number
  readonly cash: Cents
  readonly fleet: readonly Car[]
  readonly lastDay: DayReport | null   // NOUVEAU ; null tant qu'aucun jour n'a été simulé
}
```

`model` est optionnel pour ne pas changer la forme des voitures de fixture (les tests core-loop qui vérifient les clés d'une voiture restent verts). Avec `exactOptionalPropertyTypes`, ne jamais écrire `model: undefined` : la propriété est présente ou absente.

`NewCar` et la signature de `createGame` sont inchangés.

### 3.2 État côté web

Un `useReducer` dans `App` autour des fonctions pures du sim ; aucune autre source de vérité. Pas de persistance : recharger la page démarre une nouvelle partie (assumé, la sauvegarde est une spec future).

```
interface UiState {
  readonly game: GameState
  readonly error: string | null    // message FR de la dernière action refusée
  readonly notice: string | null   // message FR de la dernière action réussie
}

type GameAction =
  | { type: "buyCar"; model: CarModelId }
  | { type: "setCarPrice"; carId: CarId; dailyPrice: Cents }
  | { type: "nextDay" }
  | { type: "dismissMessage" }
```

Règles du reducer (pur, compatible double appel de `StrictMode`) :

- Action réussie : `game` remplacé, `error = null`, `notice` = message de succès (section 5.4).
- Action refusée (le sim lève) : `game` **inchangé (même référence)**, `notice = null`, `error = errorMessage(err)`. Le reducer attrape **toute** exception (`SimError` ou autre) et ne relance jamais.
- `dismissMessage` : `error = null`, `notice = null`.
- Type d'action inconnu à l'exécution : renvoie l'état inchangé.
- Seed de la partie : constante `DEFAULT_SEED = 1` (la règle A n'utilise pas le hasard ; un seed aléatoire viendra avec la sauvegarde).

## 4. Player actions

### 4.1 API sim (entrées non fiables)

| Appel                                   | Préconditions                                                                | Cas invalides et résultat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buyCar(state, model)`                  | `model` clé propre de `CAR_MODELS` ; flotte `< 50` ; `cash >= purchasePrice` | `model` inconnu : `""`, `"Used"`, `"truck"`, `"__proto__"`, `"toString"`, `"constructor"`, `"hasOwnProperty"`, `null`, `undefined`, `1`, `{}`, `[]` : `UnknownCarModelError` (`model` = valeur reçue). Flotte de 50 : `FleetFullError` (`maxFleetSize: 50`). `cash` corrompu (`NaN`, `1.5`, `Infinity`) : `SimOverflowError` (`field: "cash"`). `cash < purchasePrice`, y compris `cash` négatif : `InsufficientCashError` (`required` = prix d'achat, `available` = cash). Ids corrompus (`NaN`) ou id max `= MAX_SAFE_INTEGER` : `SimOverflowError` (`field: "carId"`). |
| `setCarPrice(state, carId, dailyPrice)` | une voiture a `id === carId` ; `0 <= dailyPrice <= 1_000_00`, entier sûr     | `carId` absent de la flotte ou non-number : `0`, `-1`, `99`, `1.5`, `NaN`, `"1"`, `null`, `undefined`, `1n` : `UnknownCarError` (`carId` = valeur reçue). Flotte vide : toujours `UnknownCarError`. `dailyPrice` dans `{-1, 1.5, NaN, Infinity, -Infinity, 1_000_01, 2 ** 53, "100", null, undefined, 1n, {}}` : `InvalidPriceError` (`dailyPrice` = valeur reçue). Voiture inconnue **et** prix invalide : `UnknownCarError`.                                                                                                                                            |
| `tick(state)` / `advance(state, days)`  | inchangés (core-loop)                                                        | inchangés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Aucune action ne mute son entrée (testé sur un état gelé en profondeur).

### 4.2 Actions joueur (UI)

| Action                | Préconditions UI                   | Cas invalides et retour joueur                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acheter un modèle** | bouton du modèle activé            | Fonds insuffisants : bouton désactivé avec la mention « Fonds insuffisants » ; si l'action parvient quand même au reducer (double clic, état périmé), bannière d'erreur `INSUFFICIENT_CASH`. Flotte pleine : tous les boutons désactivés avec « Flotte complète (50/50) » ; reducer : bannière `FLEET_FULL`. Modèle inconnu (action forgée) : bannière `UNKNOWN_CAR_MODEL`.                                                                                                                           |
| **Changer le prix**   | une voiture existe ; saisie valide | Saisie vide, lettres, signe, espace interne, exposant (`1e3`), plus de 2 décimales, plus de 7 chiffres entiers : message en ligne « Format invalide : saisissez un montant en euros, par ex. 89,90. », rien n'est envoyé au sim. Montant `> 1 000,00 €` : message en ligne « Le prix doit être compris entre 0,00 € et 1 000,00 € par jour. », rien n'est envoyé. Voiture disparue / id forgé : bannière `UNKNOWN_CAR`. Prix refusé par le sim (contournement du parseur) : bannière `INVALID_PRICE`. |
| **Jour suivant**      | toujours disponible                | Overflow (état extrême) : bannière `SIM_OVERFLOW`, la partie reste affichée telle quelle. Clics rapides : chaque clic avance d'exactement un jour.                                                                                                                                                                                                                                                                                                                                                    |
| **Fermer le message** | une bannière est affichée          | aucun                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Parseur de saisie (web, pur) : `parseEurosToCents(input: string)` :

1. `trim()` ; la chaîne doit matcher `^\d{1,7}(?:[.,]\d{1,2})?$` sinon `{ ok: false, reason: "format" }`.
2. Conversion **sans flottant** : partie entière `* 100` + partie décimale complétée à 2 chiffres (`"5"` vaut 50 centimes). Ex. `"89,9"` donne `89_90`, `"0"` donne `0`, `"150"` donne `150_00`, `"007,50"` donne `7_50`.
3. Si le résultat `> MAX_CAR_DAILY_PRICE` : `{ ok: false, reason: "range" }`. Sinon `{ ok: true, cents }`.

Le sim revalide de toute façon (`InvalidPriceError`).

## 5. UI

Texte UI en français. Couleurs et rayons via `tokens.css` uniquement (`--c-money`, `--c-danger`, `--c-road`, `--c-accent`, `--radius`, `--shadow`...). Aucune valeur affichée ne peut être `NaN`, `undefined`, `Infinity` ou vide : les montants passent par `formatCents` (affiche « — » si non fini), les entiers par une garde équivalente.

### 5.1 Disposition

Une seule page, pas de vue PixiJS (hors périmètre, aucun import de `pixi.js` dans cette feature).

```
+------------------------------------------------------------------+
| HUD : Jour 3 | Caisse 41 250,00 € | Flotte 2/50 | [Jour suivant]  |
| Hier : recettes 210,00 € · charges 85,00 € · résultat +125,00 €   |
+------------------------------------------------------------------+
| [bannière message : succès ou erreur]                    [Fermer] |
+---------------------------------------+--------------------------+
| Ma flotte                             | Acheter une voiture      |
|  Voiture n°1 · Citadine neuve         |  Citadine d'occasion     |
|   [Louée]  Prix 60,00 €/j  Coût 25,00 €/j | 4 000,00 € · 60,00 €/j |
|   [ 60,00 ] € /jour [Appliquer]       |  [Acheter]               |
|  ...                                  |  ...                     |
+---------------------------------------+--------------------------+
```

### 5.2 HUD (`Hud`)

- **Jour** : « Jour {day + 1} » (le jour en cours ; au lancement « Jour 1 »). `data-testid="hud-day"`.
- **Caisse** : `formatCents(cash)`, `data-testid="hud-cash"`, attribut `data-negative="true"` et couleur `--c-danger` si `cash < 0`, sinon `data-negative="false"` et couleur `--c-money`.
- **Flotte** : « Flotte {n}/{MAX_FLEET_SIZE} ».
- **Rapport** (`data-testid="hud-report"`) : si `lastDay === null` : « Aucune journée écoulée. » ; sinon « Hier : recettes {revenue} · charges {costs} · résultat {net} » avec `net = revenue - costs`, préfixé `+` si `net > 0`, en `--c-danger` si `net < 0`.
- **Bouton « Jour suivant »** (`data-testid="next-day"`), toujours actif, dispatch `nextDay`.

### 5.3 Flotte (`FleetPanel`, `CarRow`, `PriceEditor`)

- Flotte vide : message d'accueil (`data-testid="fleet-empty"`) : « Votre parking est vide. Achetez votre première voiture pour commencer à louer. » Le panneau d'achat est mis en évidence (bordure `--c-accent`) tant que la flotte est vide. C'est tout le « tutoriel » de cette version.
- Une ligne par voiture, dans l'ordre de la flotte, `data-testid="car-row-{id}"` :
  - Titre « Voiture n°{id} · {libellé du modèle} » ; sans `model` (fixture) : « Voiture n°{id} ».
  - Badge statut du dernier jour : « Louée » (`--c-money`) si `rented`, sinon « Au parking » (`--c-road`). Infobulle (`title`) : « Statut du dernier jour simulé ».
  - « Prix : {dailyPrice}/jour » et « Coût : {dailyCost}/jour ».
  - `PriceEditor` : `<label>` « Prix par jour (€) » + `<input type="text" inputMode="decimal" maxLength={10}>` prérempli avec le prix actuel au format `"60,00"` + bouton « Appliquer » ; la touche Entrée soumet. Saisie invalide : message en ligne sous le champ, `aria-invalid="true"`, rien n'est dispatché. Saisie valide : dispatch `setCarPrice`. Le champ se resynchronise sur le prix du sim quand celui-ci change.

### 5.4 Achat (`BuyCarPanel`)

- Une carte par modèle dans l'ordre `CAR_MODEL_IDS` : libellé, « Prix d'achat {purchasePrice} », « Coût {dailyCost}/jour », « Prix conseillé {defaultDailyPrice}/jour », bouton « Acheter » (`data-testid="buy-{modelId}"`).
- Bouton désactivé si `cash < purchasePrice` (mention « Fonds insuffisants ») ou si la flotte est pleine (mention « Flotte complète »).

### 5.5 Messages (`MessageBanner`)

Une seule bannière sous le HUD : erreur (`role="alert"`, `data-testid="error-banner"`, fond `--c-danger`) ou succès (`role="status"`, `data-testid="notice"`). Bouton « Fermer » qui dispatch `dismissMessage`. La bannière est remplacée à chaque action.

Messages de succès :

- Achat : « {Libellé} achetée pour {purchasePrice}. »
- Prix : « Prix de la voiture n°{id} fixé à {dailyPrice}/jour. »
- Jour suivant : « Jour {day} terminé : résultat {net}. » (`day` = nouveau `state.day`, c'est-à-dire le jour qui vient de s'écouler).

Messages d'erreur, `errorMessage(err: unknown): string` (par `code`, montants via `formatCents`) :

| Code / cas                                                     | Message                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `INSUFFICIENT_CASH`                                            | « Fonds insuffisants : il faut {required}, vous avez {available}. »                                         |
| `FLEET_FULL`                                                   | « Flotte complète : {maxFleetSize} voitures maximum. »                                                      |
| `UNKNOWN_CAR_MODEL`                                            | « Modèle de voiture inconnu. »                                                                              |
| `UNKNOWN_CAR`                                                  | « Cette voiture n'existe pas. »                                                                             |
| `INVALID_PRICE`                                                | « Le prix doit être compris entre 0,00 € et 1 000,00 € par jour. » (bornes formatées depuis les constantes) |
| `SIM_OVERFLOW`                                                 | « La simulation a atteint une limite numérique : action annulée. »                                          |
| tout autre cas (autre `SimError`, `Error`, valeur non-`Error`) | « Une erreur inattendue est survenue : action annulée. »                                                    |

### 5.6 Filet de sécurité

Un `ErrorBoundary` (composant classe) entoure `App` dans `main.tsx` : en cas d'erreur de rendu, il affiche « Une erreur inattendue est survenue. Rechargez la page pour recommencer. » au lieu d'un écran blanc.

## 6. Server

**Aucun travail serveur** (confirmé). Raisons : pas de sauvegarde sans `validateGameState` (core-loop §9), la partie est 100 % locale et déterministe, et aucune donnée ne quitte le navigateur. Note pour la spec sauvegarde : le schéma zod devra couvrir `lastDay` (null ou deux cents `>= 0`), `model` optionnel (un des `CAR_MODEL_IDS`) et l'unicité des ids.

## 7. Acceptance criteria

### 7.1 Sim (`npx vitest run --project sim`)

Imports depuis `./index.js` uniquement. Fixtures core-loop réutilisées (`PROFITABLE`, `IDLE`, `MIXED`). `C = 50_000_00`.

Exports et catalogue

- [ ] `buyCar`, `setCarPrice`, `CAR_MODELS`, `CAR_MODEL_IDS`, `InsufficientCashError`, `FleetFullError`, `UnknownCarModelError`, `UnknownCarError`, `InvalidPriceError` sont importables.
- [ ] `CAR_MODELS` a exactement les valeurs du tableau 2.1 ; `CAR_MODEL_IDS` deep-equal `["used", "compact", "hybrid"]` et ses éléments sont exactement les clés de `CAR_MODELS` ; pour chaque modèle `CAR_MODELS[id].id === id`.
- [ ] Invariants 2.1 vérifiés pour chaque modèle.
- [ ] `CAR_MODELS`, chaque `CarModel` et `CAR_MODEL_IDS` sont gelés (`Object.isFrozen`).

`lastDay`

- [ ] `createGame(1).lastDay === null` ; les clés de l'état sont exactement `cash, day, fleet, lastDay, rngState, seed`.
- [ ] Après `tick` sur `createGame(1, C, MIXED)` : `lastDay` deep-equal `{ revenue: 100_00, costs: 80_00 }` ; sur `IDLE` : `{ revenue: 0, costs: 50_00 }` ; sur flotte vide : `{ revenue: 0, costs: 0 }`.
- [ ] `tick` ignore le `lastDay` d'entrée (un état avec un `lastDay` arbitraire produit le même résultat).
- [ ] `advance(g, 0) === g` ; `advance(g, N)` deep-equal N ticks (lastDay inclus).
- [ ] Un tick qui lève `SimOverflowError` laisse l'entrée intacte (lastDay compris).

`buyCar`

- [ ] `buyCar(createGame(1), "compact")` : `cash === C - CAR_MODELS.compact.purchasePrice`, `fleet` deep-equal `[{ id: 1, model: "compact", dailyPrice: 60_00, dailyCost: 25_00, rented: false }]` ; `day`, `seed`, `rngState`, `lastDay` inchangés.
- [ ] Trois achats successifs donnent les ids `1, 2, 3` dans l'ordre d'achat, ajoutés en fin de flotte.
- [ ] `buyCar(createGame(1, C, PROFITABLE), "used")` donne une voiture d'id `3` ; les deux voitures de fixture restent sans propriété `model`.
- [ ] État construit à la main avec ids `[5, 2]` : la voiture achetée a l'id `6`.
- [ ] `createGame(1, 4_000_00)` puis `buyCar(…, "used")` réussit avec `cash === 0` ; `createGame(1, 4_000_00 - 1)` lève `InsufficientCashError` (`required: 4_000_00`, `available: 3_999_99`).
- [ ] État à `cash: -1` : tout achat lève `InsufficientCashError`.
- [ ] Flotte de 50 (fixture) avec cash suffisant : `FleetFullError` (`maxFleetSize: 50`) ; avec `cash: 0` : toujours `FleetFullError` (ordre) ; avec 49 voitures : l'achat réussit (50 voitures).
- [ ] Liste de `model` invalides de 4.1 : `UnknownCarModelError` avec `Object.is(err.model, input)` ; avec une flotte pleine : toujours `UnknownCarModelError` (ordre).
- [ ] `cash` à `NaN`, `1.5`, `Infinity` : `SimOverflowError` (`field: "cash"`) ; voiture d'id `NaN` ou `Number.MAX_SAFE_INTEGER` dans la flotte : `SimOverflowError` (`field: "carId"`).
- [ ] Chaque erreur : `instanceof` sa classe, `SimError` et `RangeError`, `name` et `code` exacts.
- [ ] Immuabilité : sur un état gelé en profondeur, `buyCar` ne lève pas (hors cas invalides), l'entrée reste deep-equal à sa copie, et le résultat a un objet et un tableau `fleet` différents.
- [ ] Après achat d'une `compact` puis `tick` : la voiture est `rented: true`, `lastDay` deep-equal `{ revenue: 60_00, costs: 25_00 }`, `cash === C - 9_000_00 + 35_00`.

`setCarPrice`

- [ ] Sur `createGame(1, C, MIXED)` : `setCarPrice(g, 2, 150_00)` change uniquement `fleet[1].dailyPrice` ; `rented`, `model` (présence/absence), ids, ordre, `cash`, `day`, `lastDay`, `seed`, `rngState` inchangés ; nouvel objet et nouveau tableau même si le prix est identique.
- [ ] Puis `tick` : les deux voitures sont louées, `lastDay` deep-equal `{ revenue: 250_00, costs: 80_00 }`.
- [ ] Prix `150_01` puis `tick` : voiture au parking, sa recette est `0` et son coût est payé.
- [ ] Prix `0` et `1_000_00` acceptés.
- [ ] `setCarPrice(g, id, -0)` réussit et `Object.is(fleet[i].dailyPrice, 0) === true` (normalisé en `+0`).
- [ ] Liste de `dailyPrice` invalides de 4.1 : `InvalidPriceError` (`Object.is(err.dailyPrice, input)`).
- [ ] Liste de `carId` invalides de 4.1 : `UnknownCarError` (`Object.is(err.carId, input)`) ; flotte vide : `UnknownCarError` ; `carId` inconnu et prix invalide : `UnknownCarError`.
- [ ] Ids dupliqués (état construit à la main) : seule la première voiture correspondante change.
- [ ] Immuabilité sur état gelé en profondeur.

Scénario complet et déterminisme

- [ ] `createGame(1)` → `buyCar("compact")` → `setCarPrice(1, 150_00)` → `advance(10)` : `cash === 50_000_00 - 9_000_00 + 10 * 125_00`.
- [ ] Même séquence rejouée deux fois : états deep-equal.

Non-régression

- [ ] `sim.test.ts` et `core-loop.test.ts` verts. **Seul changement autorisé** dans `core-loop.test.ts` : la liste des clés de l'état (test « only the specified fields change », ligne ~704) inclut désormais `lastDay`. Les assertions sur les clés des voitures restent inchangées (les fixtures n'ont pas de `model`).

### 7.2 Web (`npx vitest run --project web`)

Environnement : `jsdom` est configuré (`apps/web/vite.config.ts`) ; **`@testing-library` n'est pas installé** (et le manifeste est réservé aux humains). Les tests DOM utilisent donc `createRoot` de `react-dom/client` et `act` de `react`, avec `globalThis.IS_REACT_ACT_ENVIRONMENT = true`, et requêtent via `data-testid`, `role` et `label`. Fichiers `*.test.ts` / `*.test.tsx` dans `apps/web/src`.

Parseur (`parseEurosToCents`)

- [ ] Valides : `"0"` → `0`, `"60"` → `60_00`, `"89,9"` → `89_90`, `"89.90"` → `89_90`, `" 150 "` → `150_00`, `"007,50"` → `7_50`, `"1000"` → `1_000_00`, `"0,01"` → `1`.
- [ ] `reason: "format"` : `""`, `"  "`, `"abc"`, `"-5"`, `"+5"`, `"1e3"`, `"1 000"`, `"12,345"`, `"12,"`, `",5"`, `"NaN"`, `"Infinity"`, `"12345678"`, `"0x10"`.
- [ ] `reason: "range"` : `"1000,01"`, `"9999999"`.
- [ ] Jamais de résultat `ok: true` avec un `cents` non entier sûr (test sur une série d'entrées).

Messages (`errorMessage`)

- [ ] Chaque code de 5.5 donne le message attendu (montants formatés, pas de `NaN`/`undefined` dans le texte) ; `new Error("x")`, `"x"`, `null`, `undefined`, `InvalidDaysError` donnent le message générique.

Reducer (`gameReducer`, pur, sans DOM)

- [ ] `initUiState()` : `game` deep-equal `createGame(DEFAULT_SEED)`, `error` et `notice` à `null`.
- [ ] `buyCar` réussi : flotte +1, `notice` de succès, `error === null`.
- [ ] `buyCar` avec fonds insuffisants (`createGame(1, 0)`) : `game` même référence, `error` = message `INSUFFICIENT_CASH`, `notice === null`.
- [ ] `buyCar` avec un modèle forgé (`"truck" as CarModelId`) : erreur `UNKNOWN_CAR_MODEL`, pas d'exception.
- [ ] `setCarPrice` avec `carId: 99` et avec `dailyPrice: NaN` : erreurs correspondantes, pas d'exception.
- [ ] `nextDay` : `game.day + 1`, `lastDay` rempli, notice « Jour 1 terminé… ».
- [ ] `nextDay` sur un état au bord de l'overflow (`cash: Number.MAX_SAFE_INTEGER` avec une voiture rentable) : erreur `SIM_OVERFLOW`, `game` inchangé.
- [ ] `dismissMessage` remet `error` et `notice` à `null` ; action de type inconnu : état renvoyé tel quel.
- [ ] Le reducer appelé deux fois avec la même entrée donne des sorties deep-equal (pureté, `StrictMode`).

Rendu (`App` avec la prop de test `initialGame`)

- [ ] Au lancement : « Jour 1 », caisse « 50 000,00 € », `data-negative="false"`, « Aucune journée écoulée. », message `fleet-empty` présent.
- [ ] Clic sur `buy-compact` : une ligne `car-row-1` avec « Citadine neuve », badge « Au parking », prix « 60,00 € », caisse « 41 000,00 € », notice de succès, `fleet-empty` absent.
- [ ] Puis `next-day` : « Jour 2 », badge « Louée », rapport « recettes 60,00 € · charges 25,00 € · résultat +35,00 € ».
- [ ] Saisie « 150 » + « Appliquer » sur la voiture 1 : prix « 150,00 € » affiché, notice de prix.
- [ ] Saisie « abc », « -5 », « 1000,01 » : message en ligne, `aria-invalid="true"`, prix et caisse inchangés, aucune bannière d'erreur.
- [ ] `initialGame = createGame(1, 3_999_99)` : bouton `buy-used` désactivé avec « Fonds insuffisants », les trois boutons sont désactivés.
- [ ] `initialGame` avec 50 voitures : tous les boutons d'achat désactivés, « Flotte 50/50 ».
- [ ] `initialGame = createGame(1, 0, IDLE)` puis `next-day` : caisse négative affichée, `data-negative="true"`, résultat négatif.
- [ ] Voiture de fixture sans `model` : titre « Voiture n°1 » sans crash.
- [ ] Après chacun des scénarios ci-dessus, `document.body.textContent` ne contient ni `NaN`, ni `undefined`, ni `Infinity`, ni `[object Object]`.
- [ ] `formatCents` existant reste vert.

### 7.3 Global

- [ ] `npm run check` vert.
- [ ] `apps/web` n'importe pas `pixi.js` dans cette feature ; aucune nouvelle dépendance npm.
- [ ] Aucune valeur hexadécimale brute dans les composants ou leur CSS (tokens uniquement).

## 8. Split

### 8.1 Contrat sim (exact)

`packages/sim/src/economy.ts` (ajouts) :

```ts
export type CarModelId = "used" | "compact" | "hybrid";
export interface CarModel {
  readonly id: CarModelId;
  readonly purchasePrice: Cents;
  readonly dailyCost: Cents;
  readonly defaultDailyPrice: Cents;
}
export const CAR_MODEL_IDS: readonly CarModelId[]; // ["used", "compact", "hybrid"], frozen
export const CAR_MODELS: Readonly<Record<CarModelId, CarModel>>; // deep-frozen
//   used:    { purchasePrice: 4_000_00,  dailyCost: 60_00, defaultDailyPrice: 90_00 }
//   compact: { purchasePrice: 9_000_00,  dailyCost: 25_00, defaultDailyPrice: 60_00 }
//   hybrid:  { purchasePrice: 16_000_00, dailyCost: 10_00, defaultDailyPrice: 120_00 }
```

`packages/sim/src/state.ts` (modifié) : `Car.model?: CarModelId`, `DayReport`, `GameState.lastDay: DayReport | null` ; `createGame` renvoie `lastDay: null`.

`packages/sim/src/tick.ts` (modifié) : `tick` écrit `lastDay: { revenue, costs }` et recopie `model` si présent.

`packages/sim/src/actions.ts` (nouveau, réexporté par `index.ts`) :

```ts
export function buyCar(state: GameState, model: CarModelId): GameState;
export function setCarPrice(state: GameState, carId: CarId, dailyPrice: Cents): GameState;
```

`packages/sim/src/errors.ts` (ajouts) :

- `SimErrorCode` += `"INSUFFICIENT_CASH" | "FLEET_FULL" | "UNKNOWN_CAR_MODEL" | "UNKNOWN_CAR" | "INVALID_PRICE"`.
- `SimOverflowError.field` : `"cash" | "day" | "carId"`.

| Classe                  | `name`                    | `code`                | Champs (readonly)                     |
| ----------------------- | ------------------------- | --------------------- | ------------------------------------- |
| `InsufficientCashError` | `"InsufficientCashError"` | `"INSUFFICIENT_CASH"` | `required: Cents`, `available: Cents` |
| `FleetFullError`        | `"FleetFullError"`        | `"FLEET_FULL"`        | `maxFleetSize: number`                |
| `UnknownCarModelError`  | `"UnknownCarModelError"`  | `"UNKNOWN_CAR_MODEL"` | `model: unknown` (valeur reçue)       |
| `UnknownCarError`       | `"UnknownCarError"`       | `"UNKNOWN_CAR"`       | `carId: unknown` (valeur reçue)       |
| `InvalidPriceError`     | `"InvalidPriceError"`     | `"INVALID_PRICE"`     | `dailyPrice: unknown` (valeur reçue)  |

Toutes `extends SimError` (donc `RangeError`), même motif que les erreurs existantes.

### 8.2 Contrat web (exact)

| Fichier (`apps/web/src/`)      | Exports                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game/parseEuros.ts`           | `type ParseEurosResult = { ok: true; cents: Cents } \| { ok: false; reason: "format" \| "range" }` ; `parseEurosToCents(input: string): ParseEurosResult` ; `formatCentsForInput(cents: Cents): string` (ex. `60_00` → `"60,00"`, non-entier-sûr → `""`) |
| `game/messages.ts`             | `CAR_MODEL_LABELS: Readonly<Record<CarModelId, string>>` (libellés 2.1) ; `errorMessage(error: unknown): string` ; `PRICE_FORMAT_ERROR`, `PRICE_RANGE_ERROR` (messages en ligne 4.2)                                                                     |
| `game/gameReducer.ts`          | `DEFAULT_SEED = 1` ; `UiState`, `GameAction` (3.2) ; `initUiState(game?: GameState): UiState` ; `gameReducer(state: UiState, action: GameAction): UiState`                                                                                               |
| `App.tsx`                      | `App(props: { initialGame?: GameState })` : `useReducer(gameReducer, props.initialGame, initUiState)`. `initialGame` est un point d'entrée de test, jamais alimenté par une saisie joueur.                                                               |
| `components/Hud.tsx`           | `Hud(props: { game: GameState; onNextDay: () => void })`                                                                                                                                                                                                 |
| `components/MessageBanner.tsx` | `MessageBanner(props: { error: string \| null; notice: string \| null; onDismiss: () => void })`                                                                                                                                                         |
| `components/FleetPanel.tsx`    | `FleetPanel(props: { fleet: readonly Car[]; onSetPrice: (carId: CarId, dailyPrice: Cents) => void })`                                                                                                                                                    |
| `components/CarRow.tsx`        | `CarRow(props: { car: Car; onSetPrice: (dailyPrice: Cents) => void })`                                                                                                                                                                                   |
| `components/PriceEditor.tsx`   | `PriceEditor(props: { carId: CarId; dailyPrice: Cents; onSubmit: (dailyPrice: Cents) => void })`                                                                                                                                                         |
| `components/BuyCarPanel.tsx`   | `BuyCarPanel(props: { cash: Cents; fleetSize: number; highlight: boolean; onBuy: (model: CarModelId) => void })`                                                                                                                                         |
| `components/ErrorBoundary.tsx` | `ErrorBoundary` (classe), utilisé dans `main.tsx`                                                                                                                                                                                                        |
| `styles/app.css`               | styles de la page, tokens uniquement, importé par `main.tsx`                                                                                                                                                                                             |

Hooks de test (contrat partagé frontend / qa) : `hud-day`, `hud-cash` (+ `data-negative`), `hud-report`, `next-day`, `fleet-empty`, `car-row-{id}`, `buy-{modelId}`, `error-banner` (`role="alert"`), `notice` (`role="status"`). Le champ prix est associé à son `<label>` « Prix par jour (€) » ; son message d'erreur en ligne a `data-testid="price-error-{id}"`.

### 8.3 Ordre et parallélisme

Phase 1 (en parallèle) :

1. **sim-engineer** (`packages/sim/src`) : `errors.ts` (5 classes, union de codes, `"carId"`), `economy.ts` (catalogue), `state.ts` (`model?`, `DayReport`, `lastDay`), `tick.ts` (`lastDay`, copie de `model`), `actions.ts` (`buyCar`, `setCarPrice`, ordres de validation 2.7), réexports `index.ts`.
2. **qa-breaker** (sim) : `packages/sim/src/first-playable.test.ts` couvrant 7.1, plus la mise à jour de la liste de clés dans `core-loop.test.ts` (seul changement autorisé).
3. **frontend-engineer**, partie indépendante du sim : `game/parseEuros.ts` et le squelette CSS/`ErrorBoundary` (aucune dépendance aux nouveaux exports).

Phase 2 (dès que le contrat sim 8.1 compile) en parallèle :

4. **frontend-engineer** : `messages.ts`, `gameReducer.ts`, composants, `App.tsx`, `main.tsx` (dépendent des types et classes d'erreur du sim).
5. **qa-breaker** (web) : tests 7.2 (`parseEuros.test.ts`, `messages.test.ts`, `gameReducer.test.ts`, `App.test.tsx`) contre le contrat 8.2. Les tests du parseur peuvent démarrer dès la phase 1.

Phase 3 : **reviewer** : conformité au contrat (noms, valeurs, ordres de validation, pureté du sim et du reducer, aucun hex brut, aucun `NaN`/`undefined` rendu), `npm run check` vert.

**backend-engineer** : rien à faire.

## 9. Proposals / out of scope

Rien de ce qui suit n'est à implémenter sans une spec dédiée validée :

- **Vrai tutoriel guidé** (étapes : acheter, tarifer, passer un jour, lire le rapport), remplaçant le message d'accueil.
- **Revente** (`sellCar`, valeur de revente décroissante avec l'âge) : rendra le choix occasion / hybride réversible et imposera de revoir l'attribution des ids (champ `nextCarId` pour ne jamais réutiliser un id).
- **Demande client tirée au sort** (via `rng.ts`) : le prix devient un vrai arbitrage, au lieu de l'optimum fixe à `MAX_ACCEPTED_DAILY_PRICE`. Le badge « Au parking » pourra alors dire pourquoi (« trop cher », « pas de client »).
- **Badge « Nouvelle »** pour une voiture achetée depuis le dernier jour (nécessite un champ `purchasedDay`).
- **Avance rapide** (×7, ×30) via `advance`, avec rapport cumulé.
- **Sauvegarde / chargement** (serveur, zod, `validateGameState`) et seed aléatoire par partie.
- **Vue PixiJS de la ville** (parking, voitures qui partent et reviennent).
- **Crédit / emprunt** pour acheter au-delà de la caisse ; **faillite**.
- **Historique** des jours (graphique de la caisse), au-delà du seul `lastDay`.
- Ajout de `@testing-library/react` (décision humaine : manifeste protégé).
- Écarts QA à intégrer à la future spec `validateGameState` (états construits à la main uniquement, inatteignables en jeu) : ids de flotte non entiers, négatifs ou non-number ; ids dupliqués ; clés supplémentaires inconnues d'un état d'entrée recopiées telles quelles.
