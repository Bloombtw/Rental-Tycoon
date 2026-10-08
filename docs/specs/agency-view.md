# Vue de l'agence (3D Three.js), journées d'ouverture et temps continu

Statut : **approuvé** (révision 6), prêt à implémenter. Révision 6 : la vue PixiJS 2D est remplacée par une **scène 3D isométrique Three.js** avec les assets Kenney (ROADMAP, Phase 0, point 2). Sim, horloge, vitesses, HUD, feuille et bannière sont **inchangés** (déjà implémentés et approuvés). Comportements de la vue conservés : pastilles, sélection, gestes, caméra, bannière nouveau jour, démarrage en pause.
Prérequis : `core-loop.md` (rév. 5) et `first-playable.md` (rév. 3), fusionnées. Cette spec **remplace** le calendrier du tick décrit en core-loop §2.4 (section 2.1 ci-dessous).
Périmètre : `packages/sim` (temps, fait), puis `apps/web` (vue 3D, horloge, gestes tactiles). **Aucun serveur.** Dépendance utilisée : `three` (déjà installée). **Plus aucun import de `pixi.js`** à la fin de la feature ; le retrait du manifeste est une décision humaine (`docs/QUESTIONS.md`).

## Historique des décisions

Décisions de l'utilisateur :

- **Révision 1** : pastille verte seulement sur les voitures louées, sans assombrir les autres ; couleurs de secours en hex dans `scene/palette.ts`, avec test de synchronisation ; tiroir ouvert au lancement, y compris sur mobile.
- **Révision 2** : le temps défile en continu, avec pause, x1, x2, x4 et x10.
- **Révision 3** : encaissement **en direct** au départ ; « Jour suivant » supprimé ; actions `advanceTime`, `setSpeed`, `togglePause` (envoi au plus toutes les 100 ms, panneaux en `memo`, interpolation dans la scène) ; x1 = 40 ms par minute de jeu ; pas de démarrage « 07:00 en x1 » ; journée 09:00–21:00 sans nuit, bannière « nouveau jour ». Règles **mobile first** et **100 % navigateur** de CLAUDE.md.
- **Révision 4** : démarrage en pause à « Jour 1 · 09:00 » avec « Reprendre » mis en évidence ; charges à 21:00 sans prorata ; en pause au retour sur l'application ; la feuille ne se replie pas seule ; durée du toast selon la vitesse ; caméra en vue d'ensemble au démarrage.
- **Révision 5** : correction documentaire de §8.2, sans changement de design.
- **Révision 6** : moteur Three.js (ROADMAP « ⭐ »), PixiJS retiré du code, sim/horloge/HUD/feuille/bannière inchangés. Ville complète, cycle de lumière, circulation, piétons et particules renvoyés à « Ville et vie 3D ».

Choix du designer en révision 6 (option la plus raisonnable pour un tycoon mobile, révocables) :

1. **Caméra** : azimut 30° (et non 45°) et élévation 45°. L'iso pur à 45° élargit trop le parking à l'écran en portrait ; 30° garde l'effet 3/4 avec les façades visibles. Les constantes restent réglables aux captures (voir QUESTIONS).
2. **Échelles** : 1 unité ≈ 1 m. Tuile Kenney ×6 (`TILE = 6`, voies de 3 m), bâtiments ×6, voitures ×1,4 (berline ≈ 2,1 × 3,6 × 1,6). Les kits n'ont pas la même échelle d'origine, d'où une échelle par kit.
3. **Hybride → `sedan-sports`** (une berline). `suv-luxury` est réservé au futur modèle « luxe » ou SUV.
4. **Teinte de carrosserie** (précisée par le point 12) : teinte de la peinture de la carrosserie. Couleur choisie de façon déterministe par `car.id`, donc stable quand la flotte change. Si la multiplication rend mal sur le colormap, le frontend peut utiliser une copie de texture par teinte (partagée), consignée ici.
5. **Parking** : dalle d'asphalte et traits peints en meshes simples (le kit n'a pas de marquage de place) ; tuiles Kenney pour la rue, l'entrée charretière, les croisements et les trottoirs. Toutes les places des rangées occupées sont marquées, même vides.
6. **Façade nord** : bâtiment de l'agence au centre, au-dessus du parking, avec auvent et enseigne « LOCATION » ; les autres cases de la rangée deviennent un trottoir avec parasols (attente des clients).
7. **Pas de grands bâtiments au sud de la rue** : seuls des bâtiments bas (`low-detail-*`) au-delà du trottoir sud, pour ne pas masquer la rue vue du sud.
8. **Trajets** : rue à double sens, conduite à droite (départ vers l'est sur la voie sud, retour par la voie nord). Les voitures sortent en marche arrière et se garent en marche avant, nez vers le bâtiment. Le fondu en bout de rue (règle 2.3) est conservé : ce n'est pas une téléportation.
9. **Lumière fixe** de fin de matinée en attendant le cycle 09:00–21:00 de la feature suivante. Les captures de 20:30 montrent donc la même lumière.
10. **Sélection** : test sur l'écran de la boîte orientée de la voiture projetée, élargie à 44 px. C'est équivalent à un raycast sur boîte en vue orthographique, et sans WebGL.
11. **Chargement** : délai maximal de 15 s pour les `.glb`, puis repli ; message « Chargement de la ville… » pendant le chargement.

Choix faits à l'implémentation (phase B, consignés par le designer ; ils précisent ou remplacent les points ci-dessus) :

12. **Teinte** (remplace le point 4) : un shader `onBeforeCompile` sur `body` et `spoiler` repère la peinture par sa chromaticité, lue dans le colormap aux UV de la carrosserie. Il ne recolore que la peinture, en gardant l'ombrage : vitres, phares et pneus restent intacts. Si le shader n'est pas disponible, la teinte se fait en multipliant `material.color`. **Tous** les matériaux d'une voiture sont clonés, roues comprises, si bien que le fondu fait aussi disparaître les roues.
13. **Orientation** : tous les modèles de voiture regardent vers +z (détecté au chargement par les nœuds `wheel-front-*`). `ASSET_TURN_OFFSET` reste vide. Les roues tournent autour de leur axe x local.
14. **Bâtiments bas** : les `low-detail-building-*` mesurent de 9 à 13 m ; ils sont mis à l'échelle 4,2 (au lieu de 6) pour ne pas masquer la rue.
15. **Voisins du parking** : seule la rangée 0 a des bâtiments contre le parking (colonnes `-1` et `lotCols`). Le reste de ces colonnes est en trottoir ; l'anneau au-delà des rues transversales est inchangé.
16. **Lumière** : hémisphère d'intensité 0,95, plus une lumière ambiante de 0,15.
17. **Décor statique** : un `InstancedMesh` par couple (asset, mesh). Les textures colormap sont dédupliquées par kit, avec un filtrage au plus proche voisin.
18. **Indicateurs** : l'enseigne est une boîte portant une `CanvasTexture` « LOCATION ». La pastille est un sprite partagé, et la sélection un anneau plat.
19. **Captures** : avec 50 000 €, on achète environ 6 voitures. Les captures utilisent donc 6 voitures (3 occasions, 2 citadines, 1 hybride), dont 2 à 200 €.

Questions ouvertes : `docs/QUESTIONS.md`.

## 1. Fantasy

Sur mon téléphone, je regarde d'en haut mon agence au coin de la rue : dès 9 h, mes voitures bien tarifées sortent du parking une à une, roulent dans la rue et la caisse monte en direct. Le soir, elles reviennent se garer et l'agence ferme sur le bilan du jour. Je zoome, je me déplace et j'accélère le temps quand tout roule.

## 2. Rules

### 2.1 Journée d'ouverture (sim) — inchangé

- **Une journée = `DAY_MINUTES = 720` minutes de jeu**, de 09:00 à 21:00. `GameState.minute` compte les minutes écoulées depuis l'ouverture, de `0` à `719`. L'heure affichée vaut `09:00 + minute`.
- **Règle temporelle.** Avancer de `n` minutes depuis `minute = a` traite, dans l'ordre, les événements des minutes `a … a+n-1`. Quand le compteur atteint `720`, l'agence ferme et l'état passe à `day + 1`, `minute = 0`. Ni nuit ni minuit.
- **Créneau de départ** de la voiture d'index `i` (`0 ≤ i < MAX_FLEET_SIZE`) : `departureMinute(i) = 2i`, de 09:00 à 10:38. Une voiture d'index `≥ 50` n'a pas de créneau et n'est jamais louée.
- **Au créneau** : louée si `dailyPrice <= MAX_ACCEPTED_DAILY_PRICE` à cet instant ; si louée, `cash += dailyPrice` et `todayRevenue += dailyPrice` immédiatement. Un changement de prix après le créneau ne compte que le lendemain.
- **Retour** : `returnMinute(i) = departureMinute(i) + 600`, de 19:00 à 20:38. **Invariant : chaque retour a lieu avant 21:00.** Le retour ne modifie pas l'état.
- **Fermeture à 21:00** : `costs = Σ dailyCost`, `cash -= costs`, `lastDay = { revenue: todayRevenue, costs }`, puis `todayRevenue = 0`, `day + 1`, `minute = 0`.
- **`rented`** = « louée à son dernier créneau ». **`lastDay`** = `null` avant la première fermeture.
- **Achat en journée** : index `fleet.length` ; part le jour même si `departureMinute(index) >= minute`, sinon le lendemain ; paie la journée entière de charges.
- **Dépassements** : `SimOverflowError` (`"cash"`, `"day"`, `"minute"`), aucun état partiel, entrée intacte.
- **Performance** : O(flotte) par jour ; `advance(g, 3650)` avec 50 voitures tient dans le timeout Vitest.

| Fonction                         | Comportement                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `advanceMinutes(state, minutes)` | entier sûr de `0` à `720`, sinon `InvalidMinutesError` avant toute simulation. `0` → même référence ; sans créneau traversé, même `fleet`. |
| `tick(state)`                    | `advanceMinutes(state, DAY_MINUTES - state.minute)`. Depuis `minute = 0`, état final identique à l'ancien tick.                            |
| `advance(state, days)`           | Inchangé, `MAX_ADVANCE_DAYS = 3650`.                                                                                                       |
| `createGame`                     | Ajoute `minute: 0`, `todayRevenue: 0`.                                                                                                     |
| `buyCar`, `setCarPrice`          | Recopient `minute` et `todayRevenue`.                                                                                                      |

### 2.2 Horloge et vitesses (web) — inchangé

- **x1 = 40 ms par minute de jeu** (`MS_PER_GAME_MINUTE`). Vitesses `1 | 2 | 4 | 10` et une **pause** qui mémorise la vitesse ; choisir une vitesse relance le temps.
- **Démarrage en pause** à « Jour 1 · 09:00 », x1 sélectionnée, « Reprendre » mis en évidence (`--c-accent`) tant que le temps n'a jamais tourné.
- **Pause automatique** sur `visibilitychange` → `hidden` ou `pagehide` ; au retour, le jeu reste en pause.
- **Boucle d'horloge** `useGameClock` (rAF, indépendante du rendu) : `pending += min(dt, 250) * speed / 40` (dt négatif ou non fini = 0) ; envoi des minutes entières par `advanceTime` au plus toutes les 100 ms ; rien en pause ; le cleanup annule la frame.
- **Performances React** : au plus 10 envois/s, `FleetPanel` et `BuyCarPanel` en `React.memo`. La scène affiche `previewClock(committed, pending)`.
- **Bannière « nouveau jour »** : « Jour {day + 1} : l'agence ouvre ! Hier : {+net} », toast `role="status"`, fermeture d'un tap, jamais empilée. Durée `dayBannerDurationMs(speed) = max(1500, 90 * 40 / speed)` (3,6 s à x1, 1,8 s à x2, 1,5 s à x4 et x10 ; vitesse hors liste = x1), fixée à l'apparition, en temps réel.

### 2.3 Trajets (fonction pure du temps)

- `DRIVE_MINUTES = 30` (1,2 s à x1). Pour la voiture `i` à l'heure flottante `t` : **départ** si `rented === true` et `dep ≤ t < dep + 30` ; **absente** si `dep + 30 ≤ t < ret - 30` ; **retour** si `ret - 30 ≤ t < ret` ; **garée** sinon.
- **Position** : la voiture suit le trajet de 2.4 avec un easing `easeInOutQuad` sur la longueur totale. Elle ne saute jamais d'un point à un autre.
- **Cap** (`heading`, lacet autour de +y) : `atan2(dx, dz)` du segment courant ; `0` = nez vers le sud (+z), `PARKED_HEADING = π` = nez vers le bâtiment. Le premier segment de sortie (marche arrière) et le dernier du retour gardent `π`. Aux coins, le cap est mélangé sur `TURN_BLEND = 1,5` unités de part et d'autre (comme en révision 5).
- **Roues** : `wheelRotation = distanceSignée / WHEEL_RADIUS` (radians), avec `WHEEL_RADIUS = 0,42`. La distance est comptée depuis le début du trajet, négative sur le segment en marche arrière. Elle vaut `0` pour une voiture garée ou absente.
- **Opacité** : de 1 à 0 sur le dernier quart du départ, de 0 à 1 sur le premier quart du retour (en bout de rue, hors de la zone d'agence).
- La pause fige les voitures ; un changement de vitesse ne change que le rythme. **Mouvement réduit** : la voiture disparaît à `dep` et réapparaît garée à `ret`, et les roues ne tournent pas.
- **Pastille verte** sur les voitures garées avec `rented === true`. Les chevauchements sur les voies communes sont tolérés.
- La scène rend chaque frame tant que le temps défile. En pause, elle ne rend qu'à chaque changement (caméra, achat, prix, sélection, redimensionnement).

### 2.4 Plan de l'agence (grille de tuiles)

Repère : sol `y = 0`, `x` vers l'est, `z` vers le sud (vers la caméra), 1 unité ≈ 1 m. La tuile `(col, row)` couvre `[col·TILE, (col+1)·TILE] × [row·TILE, (row+1)·TILE]`, avec `TILE = 6`.

| Constante                           | Valeur                         |
| ----------------------------------- | ------------------------------ |
| `TILE`                              | 6                              |
| `SPOT_W` × `SPOT_D`                 | 3 × 5                          |
| `AISLE_D`                           | 7 (une rangée = 12 = 2 tuiles) |
| `LOT_PAD`                           | 0,75                           |
| `LANE_OFFSET`                       | 1,5 (voies à ±1,5 du centre)   |
| `ROAD_EXTEND_TILES`                 | 8                              |
| `DECOR_RING_TILES`                  | 3                              |
| `CAR_BOX` (largeur × long. × haut.) | 2,1 × 3,6 × 1,6                |
| `AGENCY_HEIGHT`                     | 9 (pour l'ajustement caméra)   |

- **Places** : `n = min(fleet.length, 50)`, `columns ∈ {5, 10}`, `rows = max(1, ceil(n / columns))`. Place `i` : rangée `floor(i / columns)`, colonne `i % columns`.
- **Parking** : `lotCols = ceil((columns·SPOT_W + 2·LOT_PAD) / TILE) + 1` tuiles (la dernière colonne est la **voie de sortie**, `exitLaneX` = son centre), soit 4 tuiles pour 5 colonnes et 7 pour 10. Le parking occupe les colonnes `[0, lotCols)` et les rangées `[1, 1 + 2·rows)`. Les places sont centrées en x dans les `lotCols - 1` premières tuiles. Centre en z de la rangée `r` : `TILE + 12r + SPOT_D/2` ; allée : `TILE + 12r + SPOT_D + AISLE_D/2`. Traits peints : `columns + 1` traits de `0,12 × SPOT_D` par rangée.
- **Rangée 0** (façade) : bâtiment de l'agence centré sur le parking, auvent, enseigne ; le reste en trottoir avec parasols.
- **Rue** : rangée `streetRow = 1 + 2·rows`, `straight` (est-ouest) des colonnes `-2 - ROAD_EXTEND_TILES` à `lotCols + 1 + ROAD_EXTEND_TILES`, avec `driveway` (ouvert au nord) en `(lotCols - 1, streetRow)` et `crossroad` en colonnes `-2` et `lotCols + 1`. Voies : `laneOutZ = centre + LANE_OFFSET` (départs vers l'est), `laneInZ = centre - LANE_OFFSET` (retours). `exitEndX = (lotCols + ROAD_EXTEND_TILES + 0,5)·TILE`.
- **Quartier minimal** (pour ne pas flotter dans le vide) :
  - deux rues transversales nord-sud (`straight`) en colonnes `-2` et `lotCols + 1`, de la rangée `-2` à `streetRow + DECOR_RING_TILES` ;
  - trottoirs (`sidewalk`) sur les colonnes `-1` et `lotCols`, et sur la rangée `streetRow + 1` ;
  - bâtiments voisins (`building`, un par tuile, modèles alternés) en colonnes `-1` et `lotCols` sur la rangée 0 seulement (le reste de ces colonnes est en trottoir), et sur `DECOR_RING_TILES` colonnes au-delà des rues transversales ;
  - deux rangées de fond (`backdrop`) au nord ;
  - bâtiments bas au sud à partir de `streetRow + 2`, à l'échelle 4,2 ;
  - lampadaires (`lamp`) toutes les 2 tuiles sur le trottoir sud et aux coins du parking ;
  - au-delà, un grand plan de sol couleur `grass` de 400 × 400 unités.
- **Trajets** :
  - sortie : centre de la place → allée → voie de sortie → `laneOutZ` → `exitEndX` ;
  - retour : `(exitEndX, laneInZ)` → voie de sortie → allée → centre de la place.
  - Chaque point des deux polylignes est sur le parking, l'entrée charretière ou la rue.
- **Colonnes** : on garde celle qui donne le plus grand zoom d'ajustement (2.5) dans la zone utile ; à égalité, 5.

### 2.5 Caméra et gestes (obligatoires)

- **Projection orthographique** fixe : azimut `CAMERA_AZIMUTH = π/6`, élévation `CAMERA_ELEVATION = π/4`. Base du plan de vue :
  - `r = (cos a, 0, -sin a)` (droite écran) ;
  - `u = (-sin a·sin e, cos e, -cos a·sin e)` (haut écran) ;
  - direction de vue `d = -(sin a·cos e, sin e, cos a·cos e)`.

  Un point 3D `p` a pour coordonnées de plan `(p·r, -(p·u))`, avec `y` vers le bas. La caméra est au sud-est et regarde vers le nord-ouest.

- **Zone utile** : inchangée (écran moins HUD, moins feuille ou panneau), mesurée par `ResizeObserver`.
- **Caméra** `{ zoom, centerX, centerY }` : `zoom` = pixels écran par unité, centre en coordonnées **du plan de vue**. Tout le calcul 2D de la révision 5 s'applique au rectangle `bounds` (projection de la boîte englobante de l'agence : colonnes `[0, lotCols)`, rangées `0` à `streetRow + 1`, hauteur `0` à `AGENCY_HEIGHT`) :
  - `fitZoom = min(utileW / bounds.width, utileH / bounds.height, MAX_FIT_ZOOM = 27)` ;
  - `minZoom = fitZoom` ;
  - `maxZoom = max(MIN_MAX_ZOOM = 40, fitZoom)`. À 40, une voiture fait environ 84 px de large.
  - **Bornes** : sur chaque axe, si l'étendue visible couvre `bounds`, le centre est bloqué au milieu, sinon il est borné pour que la vue reste dans `bounds`. Une valeur non finie ramène à la vue d'ensemble.
- **Vue initiale, suivi, « Recentrer »** : inchangés (vue d'ensemble tant que le joueur n'a pas bougé ; bouton `camera-reset` de 44 × 44 px en bas à gauche).
- **Gestes** : inchangés (`gestures.ts` réutilisé tel quel) : tap ≤ 10 px et ≤ 500 ms ; glisser ; pincer ancré au milieu des doigts ; molette `exp(-deltaY·0,0015)` bornée à [0,5 ; 2] ; survol souris en bonus.
- **Zone de toucher d'une voiture** : les 8 coins de `CAR_BOX` (orientée selon `heading`, posée au sol) sont projetés à l'écran. On en prend la boîte englobante écran, élargie à au moins 44 × 44 px autour du centre projeté. La plus proche du point l'emporte ; à égalité, l'index le plus grand. Une voiture absente ou d'opacité < 0,05 n'est pas touchable.

### 2.6 Couleurs, infobulle, robustesse

**Palette.** Elle est lue depuis `tokens.css`, avec `FALLBACK_PALETTE` en secours (test de synchronisation conservé). Clés réduites à :

| Clé         | Token CSS           | Usage               |
| ----------- | ------------------- | ------------------- |
| `grass`     | `--c-grass`         | grand plan de sol   |
| `lot`       | `--c-road`          | dalle du parking    |
| `lotLine`   | `--c-on-dark`       | traits des places   |
| `rentedDot` | `--c-money-on-dark` | pastille            |
| `highlight` | `--c-on-dark`       | anneau de sélection |
| `signBg`    | `--c-accent`        | fond de l'enseigne  |
| `signText`  | `--c-on-dark`       | texte de l'enseigne |

Les couleurs purement 3D (ciel, soleil, hémisphère, teintes de carrosserie) sont dans `SCENE_COLORS` et `CAR_TINTS` de `scene/palette.ts`, le seul fichier autorisé à contenir des hex bruts.

**Infobulle** : inchangée (`CarTooltip`, `scene/tooltip.ts`).

**Robustesse** :

- WebGL est détecté (`detectWebGL`) avant `import("three")`, qui reste chargé à la demande (`import()` de `AgencyScene3D`).
- Passage au fallback `agency-fallback` (« Vue de l'agence indisponible sur cet appareil. Utilisez le panneau « Gérer l'agence ». ») si :
  - la création du renderer échoue ;
  - un `.glb` ne charge pas, ou le chargement dépasse `LOAD_TIMEOUT_MS = 15000` ;
  - le rendu lève une exception ;
  - `webglcontextlost` survient.

  Le temps continue de défiler.

- La vue garde son propre `ErrorBoundary`. Sous StrictMode, un drapeau `cancelled` garantit que `destroy` n'intervient qu'après la fin de `create`. Une création annulée détruit tout ce qu'elle a déjà alloué.
- Les objets voiture sont indexés par position ; leur nombre ne dépend que de `fleet.length` (au plus 50). Les champs corrompus sont tolérés (modèle inconnu → `sedan` neutre, id non sûr → première teinte).

### 2.7 Rendu

Exigences de la section « ⭐ » du ROADMAP couvertes par cette feature :

- **Style** : 3D low-poly isométrique, `OrthographicCamera` en vue 3/4 plongeante (2.5), palette chaude et saturée.
- **Parking** : dalle d'asphalte `lot` au niveau des tuiles de route, places marquées de traits `lotLine`, voie de sortie reliée à la rue par l'entrée charretière Kenney.
- **Agence identifiable** : bâtiment Kenney plus grand que ses voisins (échelle `AGENCY_SCALE = 7`), avec auvent `detail-awning-wide` sur la façade sud. Une enseigne (plaque de 6 × 1,2 × 0,2) au-dessus de l'auvent porte « LOCATION » en `signText` sur `signBg`, en `CanvasTexture` dessinée une seule fois.
- **Routes** : tuiles Kenney (rue, croisements, entrée, trottoirs) reliées à la rue qu'empruntent les voitures (2.4).
- **Voitures** : modèles Kenney, une teinte de carrosserie par voiture (table ci-dessous), roues qui tournent en roulant, trajets sur les routes sans téléportation, ombre portée.

| Modèle de jeu        | Asset `cars/`      | Teintes `CAR_TINTS` (choisies par `id mod n`)                      |
| -------------------- | ------------------ | ------------------------------------------------------------------ |
| `used` (occasion)    | `hatchback-sports` | ternes : `0x9c8f7a`, `0x7d8a8f`, `0xa89f91`, `0x8c7b6b`            |
| `compact` (citadine) | `sedan`            | vives : `0xe07a5f`, `0xf2cc8f`, `0x3d9bd1`, `0xffffff`, `0x81b29a` |
| `hybrid` (berline)   | `sedan-sports`     | soignées : `0xf7f7f2`, `0x2f4b7c`, `0x1f7a6d`, `0x3a3a3a`          |
| absent ou inconnu    | `sedan`            | neutre : `0xb0b0b0`                                                |

- **Indicateurs** :
  - la **pastille** est un sprite toujours face caméra (disque `rentedDot` cerclé de `highlight`, 0,9 unité de diamètre, à `y = 2,4`), sur une texture partagée ;
  - la **sélection** est un anneau plat `highlight` au sol autour de la voiture.
- **Lumière** :
  - une seule `DirectionalLight` à ombres, venant du sud-ouest à 55° d'élévation, de couleur `SCENE_COLORS.sun` et d'intensité 2,5. Shadow map de 2048, `PCFSoftShadowMap`. Son frustum suit la zone visible (`shadowFrustum`) ;
  - une `HemisphereLight` (`hemiSky` / `hemiGround`, intensité 0,95) et une `AmbientLight` de 0,15 ;
  - les ombres sont portées par les voitures, bâtiments et lampadaires, et reçues par le sol, le parking et les tuiles ;
  - valeurs de départ, ajustables aux captures.

**Hors périmètre** (feature suivante « Ville et vie 3D ») :

- quartier complet au-delà de l'anneau minimal de 2.4 ;
- cycle de lumière 09:00–21:00, éclairage du soir (lampadaires, enseigne, phares) ;
- circulation de fond, piétons et clients, particules et « +X € » flottants ;
- rotation de caméra par quarts de tour ;
- vignettes 3D dans les cartes de modèles.

## 3. State

### 3.1 Sim — inchangé

`GameState` : `seed`, `rngState`, `day`, `minute` (0..719), `cash`, `todayRevenue`, `fleet`, `lastDay`. `Car`, `DayReport`, `NewCar` inchangés.

### 3.2 Web — inchangé

`UiState { game; error; notice; speed; paused; hasRun; dayBanner }` et `GameAction` (`buyCar`, `setCarPrice`, `advanceTime`, `setSpeed`, `togglePause`, `pause`, `dismissMessage`, `dismissDayBanner`) comme en révision 5. `nextDay` forgé est ignoré.

**État local de la vue** : caméra, `userMoved`, état du geste, infobulle `{ index, x, y } | null`, état de la feuille et statut `"loading" | "ready" | "fallback"`. La scène 3D contient les gabarits `.glb` chargés, les objets voiture et le décor ; rien n'est persisté.

## 4. Player actions

| Action                                        | Préconditions | Cas invalides et retour                                                                                                                                |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reprendre / Pause**                         | toujours      | aucun. En pause, horloge, voitures, roues et caisse sont figées ; acheter, tarifer, toucher et déplacer la caméra restent possibles.                   |
| **x1 / x2 / x4 / x10**                        | toujours      | Toucher la vitesse active relance le temps. Une vitesse forgée est ignorée.                                                                            |
| **Acheter**                                   | inchangé      | inchangé. La nouvelle voiture apparaît garée sur sa place, avec sa teinte. Avant son créneau, elle part le jour même.                                  |
| **Changer le prix**                           | inchangé      | inchangé. Le prix compte au prochain créneau.                                                                                                          |
| **Toucher une voiture**                       | vue `ready`   | Zone vide ou même voiture : l'infobulle se ferme. Une voiture absente n'est pas touchable. Si la voiture disparaît de la flotte, l'infobulle se ferme. |
| **Glisser / pincer / molette**                | vue `ready`   | Zoom borné à `[minZoom, maxZoom]`, centre borné à `bounds`. Écart nul ou `deltaY` non fini : sans effet.                                               |
| **Recentrer**                                 | vue `ready`   | aucun                                                                                                                                                  |
| **Replier / déplier la feuille**              | toujours      | inchangé (tap, ou glisser la poignée de plus de 40 px).                                                                                                |
| **Quitter l'application ou changer d'onglet** | —             | Pause automatique, le rendu s'arrête. Le jeu reste en pause au retour.                                                                                 |

Pendant le chargement de la vue, ou en fallback, les gestes sur la vue n'ont aucun effet, mais tout le reste du jeu fonctionne.

## 5. UI (iPhone portrait 390 px d'abord)

```
+------------------------------+  <- env(safe-area-inset-top)
| Jour 3 · 14:05   41 250,00 € |  HUD ligne 1
| [Reprendre][x1][x2][x4][x10] |  HUD ligne 2 (boutons 44 x 44)
| Hier +125,00 € · Auj. 210 €  |  HUD ligne 3
| (toast « Jour 4 : l'agence ouvre ! »)
|      immeubles de fond        |
|   [AGENCE + auvent + LOCATION]|  canvas WebGL plein cadre, vue 3/4
|   places marquées, voitures  |  glisser / pincer
|  ==== rue (diagonale) ====   |
| [Recentrer]  trottoir, lampes|
+------------------------------+
| ━━  Gérer l'agence · 3/50  ^ |  feuille (inchangée)
+------------------------------+  <- env(safe-area-inset-bottom)
```

- HUD, `SpeedControls`, `ManageDrawer`, cibles tactiles de 44 px, `viewport-fit=cover`, toast `day-banner`, `CarTooltip` : **inchangés**.
- **Vue** `agency-view` (`data-state` = `loading | ready | fallback`, `data-car-sprites` = nombre d'objets voiture) :
  - pendant `loading`, texte centré `agency-loading` « Chargement de la ville… » ;
  - en `fallback`, le message `agency-fallback` ;
  - le canvas a `touch-action: none` et `display: block`.

## 6. Server

Rien : le jeu doit rester jouable sans serveur. Les `.glb` sont des fichiers statiques sous `import.meta.env.BASE_URL + "assets/…"`, mis en cache hors ligne par le service worker existant.

## 7. Acceptance criteria

Sim (inchangés, déjà verts) :

1. Partie neuve : une voiture à 60 € part à son créneau et la caisse monte de 60,00 € sur le moment. À 21:00, les charges sont prélevées, « Hier » apparaît et la partie passe au lendemain à 09:00.
2. `tick` et `advance` donnent en fin de journée les mêmes `cash`, `day`, `rented` et `lastDay` qu'avant la révision 3. Tout retour a lieu avant 21:00. Une voiture achetée avant son créneau part le jour même, après son créneau le lendemain.
3. `advanceMinutes` refuse les valeurs négatives, fractionnaires, `NaN` et supérieures à 720 avant tout calcul. Avancer de `a` puis `b` minutes revient à avancer de `a + b`.

Web (logique pure, sans WebGL) :

4. Horloge et toast : comportement de la révision 5 (25 minutes par seconde à x1, 250 à x10, toast de 3,6 s, 1,8 s et 1,5 s, jamais moins de 1,5 s).
5. **Plan** :
   - de 0 à 51 voitures, les places sont dans la dalle, ne se chevauchent pas et sont alignées sur la grille ;
   - toutes les tuiles ont des colonnes et rangées entières ;
   - chaque point des trajets de sortie et de retour est sur le parking, l'entrée charretière ou une tuile de rue ;
   - le trajet relie la place à `exitEndX` sans saut.
6. **Mouvement** :
   - les phases suivent le planning ;
   - entre deux instants proches, la position et le cap changent peu (pas de saut ni de demi-tour instantané) ;
   - les roues tournent en roulant, en sens inverse pendant la marche arrière, et restent immobiles à l'arrêt ;
   - en mouvement réduit, la voiture ne roule jamais.
7. **Caméra** :
   - le zoom reste dans ses bornes et la vue ne quitte jamais l'agence ; la vue d'ensemble montre toute l'agence, façade comprise ;
   - un zoom ancré garde le point sous les doigts au même endroit ;
   - écran → sol → écran revient au même point ;
   - toucher le centre projeté d'une voiture la sélectionne, même à petit zoom (44 px).
8. **Assets** :
   - occasion, citadine, hybride et modèle inconnu donnent les modèles du tableau 2.7 ;
   - deux voitures de même modèle et d'id différents peuvent avoir des teintes différentes, et une même voiture garde toujours sa teinte ;
   - les URL commencent par `BASE_URL` et pointent vers des fichiers qui existent dans `public/assets` ;
   - gestes, infobulle et palette ne produisent jamais `NaN`, `undefined` ni `[object Object]`.

Web (DOM, jsdom sans WebGL, horloge manuelle) :

9. Au lancement : « Jour 1 · 09:00 », jeu en pause, « Reprendre » mis en évidence, fallback de la vue visible, feuille ouverte. Après un achat, x1 et l'avance de l'horloge, la caisse monte au départ, puis le toast « Jour 2 : l'agence ouvre ! Hier : +35,00 € » apparaît et disparaît seul.
10. Si un `.glb` est introuvable ou que le chargement dépasse 15 s (loader simulé), la vue passe au fallback. Masquer la page met en pause. Le démontage sous StrictMode ne laisse ni frame planifiée, ni canvas, ni renderer.

Fumée sur iPhone ou en émulation 390 × 844 (Playwright-MCP) :

11. L'agence, le HUD et la feuille repliée tiennent à l'écran sans être rognés par l'encoche ni la barre d'accueil. Pendant le chargement, on lit « Chargement de la ville… », jamais un écran blanc.
12. On reconnaît sans légende le bâtiment de l'agence (auvent, enseigne « LOCATION »), les places marquées, la rue, les voisins, les trottoirs et les lampadaires. Le bord du monde n'apparaît jamais à l'écran.
13. Le matin, les voitures sortent en marche arrière, tournent dans la rue roues en mouvement et s'éloignent, et la caisse monte. Le soir, elles reviennent par l'autre voie et se garent nez vers l'agence avant 21:00. Une voiture à plus de 150 € ne bouge pas et n'a pas de pastille.
14. Un tap sur une voiture affiche son infobulle et l'anneau de sélection. Glisser déplace la vue sans infobulle, pincer zoome jusqu'à voir une voiture en grand, et « Recentrer » revient à la vue d'ensemble. Sur ordinateur : molette ancrée sous le curseur et survol.
15. Passer de x1 à x10 puis en pause en plein trajet ne provoque ni saut ni voiture fantôme. À x10, le toast se renouvelle sans s'empiler.
16. Avec le mouvement réduit activé, les voitures ne roulent pas. Avec WebGL désactivé, ou les `.glb` bloqués par le réseau, le message de repli s'affiche et le jeu reste jouable.
17. **Performance** :
    - avec 50 voitures à x10 pendant 30 jours, `data-car-sprites` vaut 50, la mémoire reste stable (pas de géométrie ni de texture qui s'accumule) et aucune erreur n'apparaît en console ;
    - le rendu tient 30 fps ou plus en émulation iPhone avec le CPU ralenti 4×, avec 60 fps visés ;
    - en pause, aucune frame n'est rendue sans changement.
18. Les ombres des voitures et des bâtiments sont visibles. Elles ne disparaissent pas et ne pixellisent pas grossièrement au zoom maximal.
19. **Captures** (`/shot`, iPhone 390 px portrait, feuille repliée) dans `screenshots/` :
    - `agency-view-0900.png`, `agency-view-1500.png` et `agency-view-2030.png`, plus `agency-view-0910-moving.png` avec des voitures sur la route ;
    - partie de 6 voitures (3 occasions, 2 citadines, 1 hybride, ce que permettent 50 000 €), dont 2 à 200 € pour que le parking ne soit pas vide à 15:00 ;
    - le `reviewer` refuse tout rendu « programmer art » : cubes de couleur, sol vide, voitures toutes de la même couleur, absence d'ombres ou agence non identifiable.
20. `npm run check` est vert. Aucun hex brut hors de `scene/palette.ts`. `three` n'est importé que dans `scene/AgencyScene3D.ts`. Aucun fichier de `apps/web/src` n'importe `pixi.js`, et `scene/AgencyScene.ts` est supprimé.

## 8. Split

**backend-engineer** : rien. **sim-engineer** : rien. Aucun changement sim n'est attendu : `departureMinute`, `returnMinute`, `MAX_FLEET_SIZE`, `Car.id` et `Car.model` suffisent.

### 8.1 Modules

| Module                                                                                                     | Sort                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `game/*` (clock, useGameClock, reducer), `Hud`, `SpeedControls`, `ManageDrawer`, `DayBanner`, `CarTooltip` | **inchangés**                                                                            |
| `scene/gestures.ts`, `scene/tooltip.ts`                                                                    | **inchangés**                                                                            |
| `scene/webgl.ts`                                                                                           | inchangé (seuls les commentaires mentionnant Pixi changent)                              |
| `scene/camera.ts`                                                                                          | **adapté** : rectangle `bounds` au lieu de `layout`, constantes, fonctions renommées     |
| `scene/layout.ts`                                                                                          | **réécrit** : grille 3D                                                                  |
| `scene/carMotion.ts`                                                                                       | **adapté** : poses 3D, roues, sélection projetée                                         |
| `scene/palette.ts`                                                                                         | **adapté** : clés réduites, `SCENE_COLORS`, `CAR_TINTS`, `carTint` (remplace `carColor`) |
| `scene/iso.ts`, `scene/assets.ts`                                                                          | **nouveaux**, purs                                                                       |
| `scene/AgencyScene3D.ts`                                                                                   | **nouveau**, seul import de `three`                                                      |
| `scene/AgencyScene.ts`                                                                                     | **supprimé**                                                                             |
| `components/AgencyView.tsx`                                                                                | **adapté** : import dynamique de `AgencyScene3D`, message de chargement, `baseUrl`       |

### 8.2 Contrat (modules purs, sans `three` ni DOM)

```ts
// scene/layout.ts (réécrit)
export interface Vec {
  readonly x: number;
  readonly y: number;
} // écran / plan de vue (inchangé)
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}
export interface GroundRect {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}
export const TILE = 6,
  SPOT_W = 3,
  SPOT_D = 5,
  AISLE_D = 7,
  LOT_PAD = 0.75,
  LANE_OFFSET = 1.5;
export const ROAD_EXTEND_TILES = 8,
  DECOR_RING_TILES = 3,
  AGENCY_HEIGHT = 9;
export type QuarterTurn = 0 | 1 | 2 | 3; // rotation.y = turn * π/2 (+ décalage par asset, assets.ts)
export type RoadTileKind = "straight" | "crossroad" | "driveway" | "sidewalk";
//   straight : turn 0 = est-ouest, 1 = nord-sud ; driveway : turn 0 = ouvert au nord
export interface TilePlacement {
  readonly kind: RoadTileKind;
  readonly col: number;
  readonly row: number;
  readonly turn: QuarterTurn;
}
export type PropKind =
  "agency" | "awning" | "sign" | "parasol" | "building" | "backdrop" | "lowBuilding" | "lamp";
export interface PropPlacement {
  readonly kind: PropKind;
  readonly variant: number;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}
export interface AgencyLayout {
  readonly columns: 5 | 10;
  readonly rows: number;
  readonly lotCols: number;
  readonly streetRow: number;
  readonly lot: GroundRect;
  readonly spots: readonly GroundPoint[]; // longueur min(carCount, 50)
  readonly spotLines: readonly GroundRect[]; // (columns + 1) * rows
  readonly aisleZs: readonly number[]; // longueur rows
  readonly exitLaneX: number;
  readonly laneOutZ: number;
  readonly laneInZ: number;
  readonly exitEndX: number;
  readonly tiles: readonly TilePlacement[];
  readonly props: readonly PropPlacement[];
  readonly bounds: Rect; // boîte de l'agence projetée dans le plan de vue (2.5)
}
export function tileCenter(col: number, row: number): GroundPoint; // ((col + 0.5) * TILE, (row + 0.5) * TILE)
export function computeLayout(
  carCount: number,
  usable: { width: number; height: number },
): AgencyLayout; // ne lève jamais
export function exitPath(layout: AgencyLayout, index: number): readonly GroundPoint[]; // [] si pas de place
export function returnPath(layout: AgencyLayout, index: number): readonly GroundPoint[];

// scene/iso.ts (nouveau)
export const CAMERA_AZIMUTH = Math.PI / 6,
  CAMERA_ELEVATION = Math.PI / 4,
  CAMERA_DISTANCE = 200,
  SHADOW_MARGIN = 10;
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export function toViewPlane(p: Point3): Vec; // (p·r, -(p·u)), 2.5
export function viewPlaneToGround(v: Vec, groundY?: number): GroundPoint | null; // rayon de vue ∩ plan y = groundY (0 par défaut) ; null si non fini
export function projectedBounds(points: readonly Point3[]): Rect; // vide ou non fini -> {0, 0, 0, 0}
export interface CameraRig {
  readonly position: Point3;
  readonly target: Point3;
  readonly up: Point3;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}
export function cameraRig(cam: Camera, view: ScreenRect): CameraRig;
//   target = viewPlaneToGround(centre) ; position = target - d * CAMERA_DISTANCE ; up = u ; frustum = ±(w/2)/zoom, ±(h/2)/zoom
export function shadowFrustum(
  cam: Camera,
  view: ScreenRect,
): { readonly center: GroundPoint; readonly halfExtent: number };
//   les 4 coins écran projetés au sol, boîte englobante + SHADOW_MARGIN ; valeurs toujours finies (> 0)

// scene/camera.ts (adapté ; Camera, ScreenRect, panBy, zoomAt, wheelZoomFactor inchangés)
export const MAX_FIT_ZOOM = 27,
  MIN_MAX_ZOOM = 40;
export function zoomBounds(bounds: Rect, view: ScreenRect): { min: number; max: number };
export function fitCamera(bounds: Rect, view: ScreenRect): Camera; // centre = centre de bounds
export function clampCamera(cam: Camera, bounds: Rect, view: ScreenRect): Camera; // non fini -> fitCamera
export function planeToScreen(cam: Camera, view: ScreenRect, p: Vec): Vec; // ex-worldToScreen
export function screenToPlane(cam: Camera, view: ScreenRect, p: Vec): Vec; // ex-screenToWorld
//   Ordre du pincer inchangé : panBy(dx, dy) PUIS zoomAt(factor, anchor) PUIS clampCamera.

// scene/carMotion.ts (adapté ; DRIVE_MINUTES, MIN_TOUCH_PX, CarPhase, easeInOutQuad, carPhaseAt inchangés)
export const TURN_BLEND = 1.5,
  WHEEL_RADIUS = 0.42,
  PARKED_HEADING = Math.PI;
export const CAR_BOX: { readonly width: 2.1; readonly length: 3.6; readonly height: 1.6 };
export interface CarPose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly wheelRotation: number;
  readonly alpha: number;
  readonly phase: CarPhase;
}
export function carPoseAt(
  layout: AgencyLayout,
  index: number,
  rented: unknown,
  timeOfDay: number,
  reducedMotion: boolean,
): CarPose;
//   index sans place -> pose gelée invisible (alpha 0) ; jamais NaN
export function carIndexAt(
  cam: Camera,
  view: ScreenRect,
  poses: readonly CarPose[],
  screen: Vec,
): number | null; // 2.5

// scene/assets.ts (nouveau)
export type Kit = "cars" | "roads" | "city";
export interface AssetRef {
  readonly kit: Kit;
  readonly name: string;
} // fichier public/assets/{kit}/{name}.glb
export type CarAssetKey = "used" | "compact" | "hybrid" | "unknown";
export function carAssetKey(model: unknown): CarAssetKey; // own keys only ("__proto__" -> unknown)
export const CAR_ASSET: Readonly<Record<CarAssetKey, AssetRef>>; // tableau 2.7
export const ROAD_TILE_ASSET: Readonly<Record<RoadTileKind, AssetRef>>;
//   straight -> road-straight, crossroad -> road-crossroad, driveway -> road-driveway-single, sidewalk -> tile-low
export const PROP_ASSETS: Readonly<Record<PropKind, readonly AssetRef[]>>; // variant pris modulo la longueur
//   agency -> [building-h] ; awning -> [detail-awning-wide] ; sign -> [] (mesh simple) ; parasol -> [detail-parasol-a, detail-parasol-b]
//   building -> [building-a, building-b, building-c, building-d, building-e, building-f]
//   backdrop -> [building-skyscraper-a … -e] ; lowBuilding -> [low-detail-building-a … -n] ; lamp -> [light-square]
export const KIT_SCALE: Readonly<Record<Kit, number>>; // roads 6, city 6, cars 1.4
export const AGENCY_SCALE = 7; // et 4,2 pour lowBuilding (historique, point 14)
export const ASSET_TURN_OFFSET: Readonly<Record<string, QuarterTurn>>; // par nom d'asset ; vide (aucun décalage nécessaire)
export function assetUrl(ref: AssetRef, baseUrl: string): string; // `${base}/`-normalisé + `assets/${kit}/${name}.glb`
export function requiredAssets(): readonly AssetRef[]; // tous les AssetRef ci-dessus, dédupliqués

// scene/palette.ts (adapté ; parseHexColor, CssVarReader, readPalette inchangés dans leur comportement)
export type PaletteKey =
  "grass" | "lot" | "lotLine" | "rentedDot" | "highlight" | "signBg" | "signText";
export type Palette = Readonly<Record<PaletteKey, number>>;
export const PALETTE_TOKENS: Readonly<Record<PaletteKey, string>>; // tableau 2.6
export const FALLBACK_PALETTE: Palette;
export const SCENE_COLORS: Readonly<{
  sky: number;
  sun: number;
  hemiSky: number;
  hemiGround: number;
}>;
//   départ : sky 0xbfe3f2, sun 0xfff1d6, hemiSky 0xcfe8ff, hemiGround 0x9bb07a
export const CAR_TINTS: Readonly<Record<CarAssetKey, readonly number[]>>; // tableau 2.7, listes non vides
export function carTint(model: unknown, carId: unknown): number; // CAR_TINTS[carAssetKey(model)][id mod n] ; id non sûr -> [0]
```

### 8.3 Glue Three.js (frontend)

```ts
// scene/AgencyScene3D.ts : SEUL module qui importe "three" et GLTFLoader (three/examples/jsm/loaders/GLTFLoader.js)
export interface SceneOptions {
  readonly palette: Palette;
  readonly reducedMotion: boolean;
  readonly size: { width: number; height: number };
  readonly baseUrl: string;
  readonly isCancelled: () => boolean;
  readonly loadTimeoutMs?: number;
} // 15000 par défaut
export class AgencyScene3D {
  static create(host: HTMLElement, o: SceneOptions): Promise<AgencyScene3D>; // rejette : renderer, .glb, délai, annulation
  update(game: GameState, timeOfDay: number, layout: AgencyLayout): void;
  setCamera(cam: Camera, view: ScreenRect): void; // resize + cameraRig + shadowFrustum
  setHighlight(index: number | null): void;
  setReducedMotion(value: boolean): void;
  posesNow(): readonly CarPose[];
  render(): void; // exception -> échec
  onFailure(cb: () => void): void; // contexte perdu, erreur de rendu
  destroy(): void; // idempotent
}
```

- **Chargement** : `requiredAssets()` est chargé une seule fois par scène, en `Promise.all` avec délai maximal, depuis `assetUrl(ref, import.meta.env.BASE_URL)`. Chaque gabarit est **cloné** (`clone(true)`). Les textures colormap sont dédupliquées par kit (une texture GPU par kit, filtrage au plus proche voisin).
- **Décor** : `InstancedMesh` pour les tuiles de route, les trottoirs, les lampadaires et les traits de places (un `InstancedMesh` par couple asset, mesh). Les bâtiments sont des clones. Le décor est reconstruit seulement quand `columns` ou `rows` change.
- **Voitures** :
  - une instance clonée par index ;
  - tous les matériaux de la voiture sont clonés, roues comprises, pour l'opacité (`transparent` seulement quand `alpha < 1`) ;
  - teinte `carTint` par shader `onBeforeCompile` sur `body` et `spoiler`, qui repère la peinture par sa chromaticité dans le colormap et garde l'ombrage. À défaut, la teinte multiplie `material.color` ;
  - `wheelRotation` est appliquée autour de l'axe x local de `wheel-front-left/right` et `wheel-back-left/right` ;
  - le sens « avant » du modèle est lu au chargement (signe de z des nœuds `wheel-front-*`) : tous les modèles actuels regardent vers +z.
- **Renderer** :
  - `antialias: true`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, une seule lumière à ombres ;
  - rendu en continu seulement quand le temps défile, sinon à la demande ;
  - aucun rendu quand `document.hidden` est vrai.
- **Démontage** :
  - `dispose()` de toutes les géométries, matériaux, textures (dont `CanvasTexture`) et de la shadow map ;
  - puis `renderer.dispose()`, `renderer.forceContextLoss()` et retrait du canvas ;
  - suppression de l'écouteur `webglcontextlost`.
- **`AgencyView.tsx`** : même structure qu'en révision 5. Seuls changent :
  - `import("../scene/AgencyScene3D.js")` remplace l'import de Pixi ;
  - `bounds` remplace la taille du monde dans les appels caméra ;
  - `baseUrl: import.meta.env.BASE_URL` est passé à la scène ;
  - le message `agency-loading` s'affiche pendant le chargement.

### 8.4 Ordre

1. **Phase A, en parallèle** :
   - **frontend-engineer** écrit `layout.ts`, `iso.ts`, `camera.ts`, `carMotion.ts`, `assets.ts` et `palette.ts` selon 8.2. Les signatures étant figées, l'ancien `AgencyScene.ts` peut cesser de compiler : le supprimer dès cette phase, et faire afficher le fallback par `AgencyView` en attendant la phase B ;
   - **qa-breaker** écrit `iso.test.ts` et `assets.test.ts` (y compris l'existence des fichiers `.glb` sur disque), et réécrit `layout.test.ts`, `camera.test.ts`, `carMotion.test.ts`, `palette.test.ts` et `palette-tokens.test.ts` (critères 5 à 8). `gestures.test.ts` et `tooltip.test.ts` ne changent pas.
2. **Phase B, en parallèle** :
   - **frontend-engineer** écrit `AgencyScene3D.ts` et adapte `AgencyView.tsx` (8.3). Il retire toute mention de Pixi du code (`webgl.ts`, `app.css`) et ajuste les échelles et `ASSET_TURN_OFFSET` en regardant la scène ;
   - **qa-breaker** met à jour `App.test.tsx` et les tests de vue (critères 9 et 10, loader `.glb` simulé, StrictMode), et ajoute une vérification qu'aucun fichier de `apps/web/src` n'importe `pixi.js` ni n'importe `three` hors de `AgencyScene3D.ts`.
3. **Phase C** :
   - fumée en émulation iPhone (critères 11 à 18) ;
   - captures `/shot` (critère 19) ;
   - `npm run check` ;
   - passage du **reviewer**.

   Une fois la feature terminée, le lead consigne dans `docs/QUESTIONS.md` que `pixi.js` peut être retiré du manifeste.

## 9. Proposals (hors périmètre)

- **Ville et vie 3D** (prochaine feature) : quartier complet, cycle de lumière 09:00–21:00, éclairage du soir, circulation de fond, clients à pied, particules.
- Sauvegarde automatique (`localStorage`) ; raccourcis clavier ; rotation de caméra par quarts de tour ; arrivée animée d'une voiture achetée (camion de livraison) ; vignettes 3D des modèles.

## Open questions

Aucune bloquante. Les vraies questions sont dans `docs/QUESTIONS.md` (retrait de `pixi.js`, angle de caméra, mesure sur iPhone réel). La spec s'applique avec les recommandations indiquées.
