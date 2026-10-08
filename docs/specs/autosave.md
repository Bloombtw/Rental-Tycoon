# Sauvegarde automatique, seed aléatoire et reprise

Statut : **approuvé par le designer** (révision 1), prêt à implémenter. ROADMAP, Phase 1, point 1.
Prérequis : `core-loop.md`, `first-playable.md`, `agency-view.md` (rév. 6 : temps continu, démarrage en pause, pause automatique quand la page est masquée).
Périmètre : `packages/sim` (validation pure) et `apps/web` (stockage, seed, reprise, « Nouvelle partie »). **Aucun serveur.** Remplace la décision 3 de `first-playable.md` (« la partie est perdue au rechargement »).

## Historique des décisions

Choix du designer en révision 1 (option la plus raisonnable pour un tycoon mobile, révocables) :

1. **Reprise directe, sans écran titre** : à l'ouverture, la partie sauvegardée est chargée avant le premier rendu (pas de flash d'une partie neuve). Elle reprend **en pause**, comme le veut `agency-view` (« en pause au retour »), avec « Reprendre » mis en évidence et un message « Partie reprise ».
2. **Ce qui est sauvegardé** : le `GameState` complet et la vitesse choisie. **Pas** les minutes fractionnaires en attente (moins d'une minute de jeu perdue, soit 40 ms à x1), ni la caméra, la feuille, les messages, le toast ou l'infobulle.
3. **Une seule partie** (un seul emplacement). Pas de choix de slot.
4. **Version** : l'enveloppe de sauvegarde (web) et la forme du `GameState` (sim) ont chacune un numéro. Les migrations de `GameState` vivent dans le sim, qui seul connaît les formes. Une version inconnue (plus récente ou trop ancienne sans migration) est refusée.
5. **Sauvegarde refusée = jamais perdue** : avant de commencer une nouvelle partie, le texte brut refusé est copié dans un emplacement de secours (`rental-tycoon/save-rejected`, écrasé à chaque refus). Utile si une mise à jour du jeu la rend relisible.
6. **Anti-triche hors sujet** : jeu solo. La validation refuse les états **impossibles** (NaN, négatifs, ids en double, modèle inconnu, charges qui ne correspondent pas au modèle), pas un état modifié mais cohérent. Un futur classement ne devra jamais faire confiance à une sauvegarde locale.
7. **Seed** : tiré par le web avec `crypto.getRandomValues` (entier 32 bits non signé), passé à `createGame`. Le sim reste pur.
8. **Ouvrir la confirmation « Nouvelle partie » met le jeu en pause** ; « Annuler » le laisse en pause (le joueur touche « Reprendre »). Plus simple et sans surprise.
9. **Clé préfixée** : GitHub Pages partage l'origine `*.github.io` entre tous les dépôts du propriétaire ; les clés commencent donc par `rental-tycoon/`.
10. **Copie de secours en échec** : si la copie vers `REJECTED_SAVE_KEY` échoue, l'ancienne sauvegarde reste dans `SAVE_KEY` et la nouvelle partie ne l'écrase pas. La copie est retentée avant chaque écriture ; tant qu'elle échoue, aucune écriture dans `SAVE_KEY` (avertissement `SaveWarning`). Garantit la décision 5 (jamais perdue).

Écarts acceptés à l'implémentation (consignés par le designer ; ils précisent 2.4 et 2.5) :

11. **Changement de vitesse** : sauvegardé immédiatement (action du joueur), puis le rythme normal de 2 s reprend.
12. **Sauvegarde refusée retirée** : une fois la copie de secours réussie, la sauvegarde refusée est supprimée de `SAVE_KEY`, pour ne pas répéter le message d'erreur à chaque lancement.
13. **Pas d'écriture au montage** : une partie neuve jamais touchée n'est écrite qu'au premier changement (achat, prix, vitesse, temps qui défile).

Questions ouvertes : `docs/QUESTIONS.md`, section « autosave ».

## 1. Fantasy

Je ferme l'appli dans le métro, Safari la décharge, je la rouvre le soir : mon agence est exactement là où je l'ai laissée, à la minute près, et un tap sur « Reprendre » relance la journée.

## 2. Rules

### 2.1 Format de sauvegarde (web)

Une clé `localStorage` : `SAVE_KEY = "rental-tycoon/save"`. Valeur : JSON d'une enveloppe.

| Champ          | Type                   | Règle                                                                                                          |
| -------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `kind`         | `"rental-tycoon-save"` | sinon refus                                                                                                    |
| `version`      | `1`                    | `SAVE_FORMAT_VERSION` (forme de l'enveloppe) ; autre valeur → refus                                            |
| `stateVersion` | entier                 | `GAME_STATE_VERSION` du sim au moment de l'écriture ; transmis au sim                                          |
| `savedAt`      | entier (ms epoch)      | `Date.now()` côté web, pour les futurs gains hors ligne. Invalide → ignoré (remplacé par `null`), pas un refus |
| `speed`        | `1 \| 2 \| 4 \| 10`    | invalide → `1`, pas un refus                                                                                   |
| `game`         | objet                  | passé à `restoreGameState(game, stateVersion)` du sim                                                          |

- Texte de plus de `MAX_SAVE_CHARS = 200_000` caractères : refus sans `JSON.parse` (une partie de 50 voitures fait environ 5 ko).
- JSON illisible, enveloppe invalide ou `game` refusé par le sim : **refus**.

### 2.2 Validation du `GameState` (sim, pure)

`validateGameState(raw: unknown): GameState` renvoie une **copie neuve** ne contenant que les champs connus (les champs en trop sont ignorés, `-0` normalisé en `0`), ou lève `InvalidGameStateError { path, issue }`. Règles :

| Champ                 | Règle                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| racine                | objet non nul, pas un tableau                                                                           |
| `seed`                | entier sûr                                                                                              |
| `rngState`            | entier de `0` à `2^32 - 1`                                                                              |
| `day`                 | entier sûr `≥ 0`                                                                                        |
| `minute`              | entier de `0` à `DAY_MINUTES - 1` (719)                                                                 |
| `cash`                | entier sûr (négatif autorisé : découvert dû aux charges)                                                |
| `todayRevenue`        | entier sûr `≥ 0` ; vaut `0` si `minute === 0`                                                           |
| `fleet`               | tableau de `0` à `MAX_FLEET_SIZE` voitures                                                              |
| `fleet[i].id`         | entier sûr `≥ 1`, **unique** dans la flotte                                                             |
| `fleet[i].model`      | absent (voitures de fixture) ou l'un de `CAR_MODEL_IDS` (clés propres seulement)                        |
| `fleet[i].dailyPrice` | entier de `0` à `MAX_CAR_DAILY_PRICE`                                                                   |
| `fleet[i].dailyCost`  | entier de `0` à `MAX_CAR_DAILY_COST` ; si `model` est présent, **égal** à `CAR_MODELS[model].dailyCost` |
| `fleet[i].rented`     | booléen                                                                                                 |
| `lastDay`             | `null` ou `{ revenue, costs }` entiers sûrs `≥ 0` ; `null` **si et seulement si** `day === 0`           |

`issue` ∈ `"type" | "range" | "unknownModel" | "duplicateId" | "inconsistent"` ; `path` désigne le champ fautif (ex. `"fleet[3].model"`, `"lastDay"`).

**Aller-retour** : pour tout état atteignable par `createGame` puis `buyCar`, `setCarPrice`, `advanceMinutes`, `advance`, `validateGameState(JSON.parse(JSON.stringify(s)))` est égal en profondeur à `s`.

### 2.3 Versions et migrations (sim)

- `GAME_STATE_VERSION = 1`.
- `restoreGameState(raw, stateVersion)` : si `stateVersion` n'est pas un entier de `1` à `GAME_STATE_VERSION`, lève `UnsupportedGameStateVersionError { version, newer }` (`newer = true` si entier `> GAME_STATE_VERSION`). Sinon applique les migrations `v → v+1` jusqu'à la version courante (aucune en v1), puis `validateGameState`.
- Règle pour les futures specs : **toute** modification de la forme de `GameState` (ex. `nextCarId`, Phase 3) incrémente `GAME_STATE_VERSION` et ajoute une migration pure, testée, depuis la version précédente.

### 2.4 Quand sauvegarder (web)

L'écriture n'a lieu que si `game` ou `speed` a changé depuis la dernière écriture réussie.

- **Pendant que le temps défile** : au plus une écriture toutes les `SAVE_THROTTLE_MS = 2000` ms (temps réel), avec écriture finale différée pour ne pas perdre le dernier changement.
- **Immédiatement** : après un achat ou un changement de prix réussi, à chaque fermeture de journée (changement de `day`), à la mise en pause, sur `visibilitychange` → `hidden` et sur `pagehide` (écriture synchrone, c'est ce qui sauve la partie quand iOS décharge la PWA), et juste après « Nouvelle partie ».
- Écrire le JSON complet à chaque fois (pas de diff).

### 2.5 Au lancement (web)

Lecture synchrone dans l'initialiseur du reducer, avant le premier rendu :

| Cas                                                  | Résultat                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sauvegarde valide                                    | Partie restaurée, **en pause**, vitesse restaurée, `hasRun = false` (« Reprendre » en évidence), notice « Partie reprise : Jour 3 · 14:05. Touchez Reprendre pour continuer. » |
| Pas de sauvegarde                                    | Nouvelle partie avec seed aléatoire, comme aujourd'hui (pause, x1, « Jour 1 · 09:00 »)                                                                                         |
| Sauvegarde refusée (illisible, invalide)             | Texte brut copié dans `rental-tycoon/save-rejected`, nouvelle partie, erreur « Sauvegarde illisible : une nouvelle partie a commencé. »                                        |
| Sauvegarde d'une version plus récente (`newer`)      | Idem, erreur « Cette sauvegarde vient d'une version plus récente du jeu : une nouvelle partie a commencé. Mettez l'application à jour pour la retrouver. »                     |
| `localStorage` inaccessible (accès qui lève, `null`) | Nouvelle partie, avertissement de sauvegarde (2.6)                                                                                                                             |

La prop de test `initialGame` de `App`, si fournie, court-circuite la lecture (mais l'autosave écrit quand même dans le stockage fourni).

### 2.6 Stockage indisponible ou plein

Le jeu reste **toujours** jouable ; aucune exception de stockage ne remonte au rendu.

- **Indisponible** (navigation privée, accès qui lève, `localStorage` absent) : avertissement « Sauvegarde indisponible sur cet appareil : la partie sera perdue en fermant l'application. »
- **Écriture refusée** (quota, `setItem` qui lève) : avertissement « Sauvegarde impossible (stockage plein ?) : la partie continue mais ne sera pas conservée. » Les tentatives continuent au rythme normal ; à la première écriture réussie, l'avertissement disparaît seul.
- L'avertissement s'affiche **une fois** par épisode d'échec (pas toutes les 2 s), et se ferme d'un tap.

### 2.7 Seed

`newSeed()` (web) : `crypto.getRandomValues(new Uint32Array(1))[0]`. Si `crypto.getRandomValues` est absent ou lève : repli `Math.floor(Math.random() * 2^32)` (autorisé hors du sim). Toujours un entier de `0` à `2^32 - 1`, donc accepté par `createGame`. `DEFAULT_SEED` n'est plus utilisé par l'application (il peut rester pour les tests).

## 3. State

**Sim** : aucun champ nouveau dans `GameState`. Nouveaux exports : `GAME_STATE_VERSION`, `validateGameState`, `restoreGameState`, `InvalidGameStateError`, `UnsupportedGameStateVersionError`, codes `"INVALID_GAME_STATE"` et `"UNSUPPORTED_STATE_VERSION"` dans `SimErrorCode`.

**Web** :

- `UiState` inchangé ; nouvelle action `{ type: "newGame"; seed: number }` (seed invalide → état inchangé).
- État de l'autosave (hors reducer, dans `useAutosave`) : `SaveStatus = "ok" | "unavailable" | "failed"`, référence de la dernière enveloppe écrite, horodatage de la dernière écriture, drapeau « avertissement fermé ».
- État local du dialogue : ouvert / fermé.

## 4. Player actions

| Action                        | Préconditions         | Effet et cas invalides                                                                                                                                                                                                                               |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rouvrir l'application**     | —                     | 2.5. Ne montre jamais un écran blanc, `NaN` ou `undefined`, quel que soit le contenu du stockage.                                                                                                                                                    |
| **Quitter / masquer l'appli** | —                     | Pause (existant) puis écriture immédiate. Stockage en échec : rien de visible de plus, l'avertissement reste.                                                                                                                                        |
| **Nouvelle partie** (bouton)  | toujours              | Met en pause et ouvre la confirmation. Deux taps rapides n'ouvrent qu'un dialogue.                                                                                                                                                                   |
| **Confirmer « Recommencer »** | dialogue ouvert       | Nouveau seed, `createGame(seed)`, pause, x1, `hasRun = false`, écriture immédiate (écrase l'ancienne), notice « Nouvelle partie commencée. ». Stockage indisponible : la nouvelle partie démarre quand même. Double tap : une seule nouvelle partie. |
| **Annuler**                   | dialogue ouvert       | Ferme le dialogue, partie intacte, reste en pause. Tap hors du dialogue ou touche Échap = Annuler.                                                                                                                                                   |
| **Fermer l'avertissement**    | avertissement visible | Masqué jusqu'au prochain épisode d'échec.                                                                                                                                                                                                            |

## 5. UI (iPhone portrait 390 px d'abord)

- **« Nouvelle partie »** : en bas de la feuille « Gérer l'agence », section « Partie », bouton secondaire pleine largeur (hauteur ≥ 44 px, style danger discret via tokens), sous le catalogue. `data-testid="new-game"`.
- **Confirmation** (`role="alertdialog"`, `aria-modal`, `data-testid="new-game-dialog"`) : carte centrée, largeur `min(100% - 32px, 360px)`, voile sombre, respect des safe areas. Titre « Recommencer une partie ? » ; texte « Ta partie actuelle (Jour 12, 41 250,00 €, 8 voitures) sera définitivement effacée. » ; boutons ≥ 44 px côte à côte « Annuler » (focus par défaut) et « Recommencer » (danger). Apparition en fondu court (désactivé si mouvement réduit).
- **« Partie reprise » et erreurs de chargement** : canal existant `MessageBanner` (notice / error), fermeture d'un tap.
- **Avertissement de sauvegarde** : bandeau `SaveWarning` (`role="alert"`, `data-testid="save-warning"`) sous le HUD, au-dessus de `MessageBanner`, couleur d'avertissement des tokens, bouton « OK » 44 × 44 px. Texte de 2.6, retour à la ligne autorisé, jamais tronqué à 390 px.
- Pas d'indicateur « sauvegardé » permanent : la sauvegarde est invisible quand elle marche (norme des tycoons mobiles).

**Rendu** : aucun changement de la scène 3D. La partie restaurée s'affiche directement à l'heure sauvegardée (les poses sont une fonction pure du temps : voitures garées ou sur la route au bon endroit, lumière de l'heure). Le dialogue et le bandeau suivent les tokens (relief, état pressé), sans hex brut.

## 6. Server

Rien. Le jeu ne dépend jamais du serveur ; la sauvegarde est 100 % locale (`localStorage`, depuis `apps/web` uniquement).

## 7. Acceptance criteria

1. Je joue jusqu'au Jour 3 · 14:05 avec 4 voitures, je recharge la page : même jour, même heure (à la minute), même caisse, même flotte (ids, modèles, prix, état loué), même vitesse ; le jeu est en pause, « Reprendre » est en évidence et je lis « Partie reprise : Jour 3 · 14:05… ».
2. J'achète une voiture puis je masque l'appli (ou `pagehide`) aussitôt : à la réouverture, la voiture et la dépense sont là.
3. Temps qui défile à x10 : au plus une écriture toutes les 2 s environ, et une écriture à chaque fermeture de journée ; rien n'est écrit tant que la partie est en pause sans changement.
4. Deux nouvelles parties d'affilée ont des seeds différents (avec une source aléatoire simulée, le seed vaut exactement la valeur tirée) ; sans `crypto`, une partie démarre quand même.
5. « Nouvelle partie » ouvre une confirmation qui montre jour, caisse et nombre de voitures ; « Annuler » ne change rien ; « Recommencer » donne « Jour 1 · 09:00 », 50 000,00 €, flotte vide, en pause, et un rechargement redonne cette nouvelle partie.
6. Avec un stockage dont chaque accès lève une exception, le jeu se lance, est jouable (acheter, tarifer, faire défiler le temps) et affiche « Sauvegarde indisponible sur cet appareil… ».
7. Si l'écriture lève (quota), le jeu continue, l'avertissement s'affiche une seule fois, puis disparaît seul à la première écriture réussie.
8. Une sauvegarde au JSON illisible, tronqué, vide, ou de plus de 200 000 caractères donne une nouvelle partie, le message « Sauvegarde illisible… », et le texte d'origine se retrouve dans `rental-tycoon/save-rejected`.
9. Une sauvegarde avec `stateVersion` supérieur à la version courante donne le message « …version plus récente… » et est conservée dans l'emplacement de secours.
10. `validateGameState` refuse avec `InvalidGameStateError` (chemin du champ fautif) : `cash` NaN, fractionnaire ou en texte ; `day` négatif ; `minute` 720 ; flotte de 51 voitures ; deux voitures de même id ; modèle `"tesla"` ; occasion avec `dailyCost` 0 ; `dailyPrice` négatif ou > 1 000 € ; `rented` non booléen ; `lastDay` absent au Jour 2 ou présent au Jour 1 ; racine `null` ou tableau.
11. `validateGameState` accepte tout état atteint en jouant (achats, prix, 3650 jours avancés, caisse négative) après un aller-retour JSON, et renvoie un état égal ; les champs en trop sont retirés.
12. `restoreGameState` refuse les versions `0`, `-1`, `1.5`, `"1"` et `GAME_STATE_VERSION + 1` avec `UnsupportedGameStateVersionError` (`newer` vrai seulement pour la dernière).
13. Une enveloppe avec `speed` ou `savedAt` invalide est quand même restaurée (vitesse x1) ; une enveloppe avec `kind` ou `version` faux est refusée.
14. Quel que soit le contenu du stockage, aucun écran blanc et aucun `NaN`, `undefined` ni `[object Object]` n'apparaît dans le HUD, les panneaux ou les messages.
15. Sur iPhone (ou émulation 390 × 844) : le bouton, les boutons du dialogue et « OK » du bandeau font au moins 44 px, le dialogue tient à l'écran sans être rogné par l'encoche ni la barre d'accueil, et rien n'est tronqué.
16. PWA installée sur iPhone, partie lancée, appli fermée depuis le sélecteur d'applications puis rouverte : la partie reprend (vérification humaine, voir QUESTIONS).
17. `npm run check` vert ; aucun accès à `localStorage`, `crypto` ou `Date.now` dans `packages/sim`.

## 8. Split

**backend-engineer** : rien.

### 8.1 sim-engineer (`packages/sim/src/save.ts`, exporté par `index.ts`)

```ts
export const GAME_STATE_VERSION = 1;

export type GameStateIssue = "type" | "range" | "unknownModel" | "duplicateId" | "inconsistent";

// errors.ts : SimErrorCode += "INVALID_GAME_STATE" | "UNSUPPORTED_STATE_VERSION"
export class InvalidGameStateError extends SimError {
  readonly code: "INVALID_GAME_STATE";
  readonly path: string; // "cash", "fleet[3].model", "lastDay"...
  readonly issue: GameStateIssue;
}
export class UnsupportedGameStateVersionError extends SimError {
  readonly code: "UNSUPPORTED_STATE_VERSION";
  readonly version: unknown;
  readonly newer: boolean;
}

/** Pure. Returns a fresh, normalised copy (known fields only) or throws InvalidGameStateError (2.2). */
export function validateGameState(raw: unknown): GameState;

/** Pure. Migrates from `stateVersion` to GAME_STATE_VERSION (none in v1), then validates (2.3). */
export function restoreGameState(raw: unknown, stateVersion: unknown): GameState;
```

Ne lève jamais d'autre erreur que ces deux classes, même sur getters qui lèvent ou objets exotiques (capturer et convertir en `InvalidGameStateError { issue: "type" }`).

### 8.2 frontend-engineer (`apps/web/src`)

```ts
// game/seed.ts
export function newSeed(random?: { getRandomValues(a: Uint32Array): Uint32Array }): number; // 2.7, jamais hors [0, 2^32-1]

// game/saveStorage.ts
export interface SaveStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
export function browserSaveStorage(): SaveStorage | null; // null si localStorage absent ou si l'accès lève ; ne lève jamais

// game/saveFormat.ts (pur)
export const SAVE_KEY = "rental-tycoon/save",
  REJECTED_SAVE_KEY = "rental-tycoon/save-rejected";
export const SAVE_FORMAT_VERSION = 1,
  MAX_SAVE_CHARS = 200_000,
  SAVE_THROTTLE_MS = 2000;
export interface SaveEnvelope {
  kind: "rental-tycoon-save";
  version: 1;
  stateVersion: number;
  savedAt: number | null;
  speed: Speed;
  game: GameState;
}
export function encodeSave(game: GameState, speed: Speed, savedAt: number): string;
export type DecodeResult =
  | { kind: "empty" }
  | { kind: "ok"; game: GameState; speed: Speed; savedAt: number | null }
  | { kind: "rejected"; reason: "corrupt" | "newer" };
export function decodeSave(raw: string | null): DecodeResult; // ne lève jamais

// game/persistence.ts
export type SaveStatus = "ok" | "unavailable" | "failed";
export interface InitResult {
  ui: UiState;
  status: SaveStatus;
}
export function loadInitialState(o: {
  storage: SaveStorage | null;
  newSeed: () => number;
  initialGame?: GameState;
}): InitResult; // 2.5, ne lève jamais
export function writeSave(
  storage: SaveStorage | null,
  game: GameState,
  speed: Speed,
  now: number,
): SaveStatus; // ne lève jamais

// game/useAutosave.ts
export function useAutosave(o: {
  storage: SaveStorage | null;
  game: GameState;
  speed: Speed;
  paused: boolean;
  initialStatus: SaveStatus;
  now?: () => number;
}): { status: SaveStatus; warningVisible: boolean; dismissWarning(): void; flush(): void }; // 2.4, 2.6

// game/gameReducer.ts : GameAction += { type: "newGame"; seed: number }
```

- `App` : props `{ initialGame?; clockDriver?; storage?: SaveStorage | null; newSeed?: () => number }` (défauts : `browserSaveStorage()`, `newSeed`). `useReducer` initialisé par `loadInitialState`. L'écouteur `visibilitychange`/`pagehide` existant appelle aussi `flush()`.
- Composants : `NewGameButton` + `NewGameDialog` (dans `ManageDrawer`), `SaveWarning`. Textes de 2.5, 2.6 et 5 dans `game/messages.ts`.

### 8.3 Ordre

1. **Phase A, en parallèle** : sim-engineer écrit `save.ts` et les erreurs (8.1) ; frontend-engineer écrit `seed.ts`, `saveStorage.ts`, `saveFormat.ts` contre les signatures de 8.1 (stub local si besoin) ; qa-breaker écrit les tests sim (critères 10 à 12) et `saveFormat`/`seed` (4, 8, 9, 13).
2. **Phase B, en parallèle** : frontend-engineer écrit `persistence.ts`, `useAutosave.ts`, l'action `newGame`, les composants et le câblage d'`App` ; qa-breaker écrit les tests DOM (1 à 3, 5 à 7, 14) avec stockage simulé (y compris un stockage qui lève) et horloge manuelle, en vidant le stockage entre deux tests.
3. **Phase C** : fumée en émulation 390 × 844 (15), `npm run check`, reviewer. Le critère 16 est relevé par un humain.

## Open questions

Aucune bloquante ; voir `docs/QUESTIONS.md`, section « autosave », avec les recommandations appliquées.
