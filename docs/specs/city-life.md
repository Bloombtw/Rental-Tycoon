# Ville et vie 3D : quartier, trajets en ville, cycle de lumière, circulation

Statut : **approuvé** (révision 2 : constats d'implémentation de la Phase A, décisions 16 à 19).
Prérequis : `agency-view.md` (rév. 6), implémentée. Cette spec la **prolonge** : tout ce qui n'est pas redéfini ici reste valable (sim, horloge, vitesses, HUD, feuille, bannière, gestes, caméra, sélection, fallback).
Périmètre : `apps/web` uniquement (frontend-engineer + qa-breaker). **Aucun changement sim ni serveur.**
Hors périmètre : « +90 € », pièces, compteur animé, confettis (Phase 2, point 4), clients au comptoir (point 5), sons (point 6), piétons d'ambiance (reportés, voir décision 9).

## Historique des décisions

Choix du designer (option la plus raisonnable pour un tycoon mobile, révocables) :

1. **Quartier en grille** : rues tous les 4 tuiles (1 tuile de rue + bloc de 3 tuiles), 3 blocs de chaque côté du bloc de l'agence. Le plan est fixe pour une taille de parking donnée ; il est reconstruit seulement quand `columns` ou `rows` change (au plus 5 fois par partie).
2. **Caméra inchangée** : les bornes de déplacement restent celles de l'agence (`layout.bounds`). La ville est assez grande pour que son bord ne soit jamais visible, même sur un écran de 2560 × 1080. Explorer la ville en glissant est renvoyé aux propositions.
3. **Zonage par visibilité** (caméra au sud-est) : rien de haut au sud ni à l'est de l'agence. La rangée de blocs juste au sud de la rue principale est basse : [chantier | square | parking de quartier]. Les gratte-ciel sont au nord, où ils ne masquent rien.
4. **Bâtiments variés** : `building-a` à `-n` sauf `h` (réservé à l'agence), choisis par un hash déterministe de la cellule. Deux voisins sur la même rue ne sont jamais identiques. Chaque bâtiment a sa façade tournée vers la rue. Au-delà du 2ᵉ anneau de blocs : gratte-ciel au nord, `low-detail-*` **teintés** (brique, sable, crème…) ailleurs, à la place des tours pâles actuelles.
5. **Arbres** : aucun kit n'en contient. Ce sont des arbres low-poly procéduraux (tronc à 6 faces, houppier icosaèdre en ombrage plat, 3 verts), instanciés.
6. **Nos voitures en ville** : 6 itinéraires (tout droit, droite, gauche, puis une 2ᵉ manœuvre), choisis par `index mod 6`. Elles roulent à droite, tournent aux carrefours et disparaissent au bord du plan, toujours hors champ. Le fondu d'opacité est supprimé, donc l'opacité vaut 0 ou 1. `DRIVE_MINUTES` passe de 30 à 60 pour garder le même espacement entre voitures sur un trajet 2 fois plus long.
7. **Circulation de fond sur un « temps d'ambiance »** et non sur le temps de jeu. À x10, le temps de jeu ferait traverser l'écran aux voitures en 0,1 s. Le temps d'ambiance avance en temps réel × `AMBIENT_RATE` (x1 → 1, x2 → 1,5, x4 → 2, x10 → 3) et reste figé en pause. Les positions sont une fonction pure de ce temps. Nos voitures restent sur le temps de jeu (contrat de la sim), donc elles vont nettement plus vite que la circulation (voir QUESTIONS).
8. **Circulation sans collision par construction** : chaque véhicule tourne autour d'**un** bloc dans le sens horaire, sur la voie de droite, qui borde ce bloc. Deux blocs n'ont jamais de voie en commun, et sur une même boucle tous les véhicules ont la même vitesse et un espacement d'au moins 12 m. Le bloc de l'agence et le square n'ont pas de boucle : la rue devant l'agence est à nous. Les chevauchements avec nos voitures restent tolérés (comme en rév. 6).
9. **Piétons reportés** : une gélule sans membres serait du « programmer art » au zoom maximal. Ils seront faits avec les clients (Phase 2, point 5), si un kit de personnages est ajouté (QUESTIONS).
10. **Feux tricolores décoratifs** : personne ne s'y arrête. Les arrêts aux feux demanderaient des files d'attente, ce n'est pas bon marché. Il n'y a pas de cycle de couleur animé, pour ne pas montrer de voiture qui grille un feu rouge.
11. **Lumières du soir sans vraies lumières** : halos en billboards additifs, flaques de lumière au sol, enseigne émissive, faisceaux de phares en décalques au sol. La seule lumière à ombres reste le soleil, et aucune `PointLight` n'est ajoutée. La caméra ayant une orientation fixe, un quad orienté une fois face à la caméra est un billboard : tous les halos tiennent dans un seul `InstancedMesh`.
12. **Toutes les voitures instanciées** (joueur, circulation, décor). Un `InstancedMesh` par (modèle, carrosserie) et un par (modèle, roues). La teinte du joueur passe par `instanceColor` et le shader de peinture existant. Avec des clones, 50 voitures coûtaient environ 300 draw calls par passe.
13. **Lumière au passage de 21:00 à 09:00** : elle saute du crépuscule au matin, en même temps que la bannière « nouveau jour ». Aucun fondu.
14. **Pas de poteaux électriques** (fils difficiles à orienter, encombrent la vue) **ni de fenêtres éclairées** (il faudrait un masque dans le colormap). Les deux sont renvoyés aux propositions.
15. **Palier de qualité** : il ne fait que descendre pendant une session, et il descend aussi en mode économie d'énergie de l'iPhone (30 fps), ce qui est voulu.

Révision 2 (constats d'implémentation, Phase A) :

16. **Espacement de la circulation par boucle seulement** : `MIN_TRAFFIC_GAP` est garanti entre véhicules d'une même boucle. Deux véhicules de boucles voisines peuvent se croiser à environ 3 m, sur les voies opposées d'une même rue. C'est accepté : c'est une circulation normale à double sens (critère 5).
17. **Bord sud prolongé** : `extent.rowMax` reçoit `SOUTH_EXTRA_ROWS = 6` rangées de plus au sud, pour que le bord du monde ne soit jamais visible à 390 × 844 avec 26 à 50 voitures (parking de 10 colonnes). La caméra regarde depuis le sud-est, donc les coins de l'écran portent bien plus loin au sud qu'au nord (2.1).
18. **Choix de rendu** :
    - gratte-ciel (`tall`, `farTall`) à l'échelle **0,72** (`SKYSCRAPER_SCALE`, privé à `cityPlan.ts`) ;
    - panneau de rue : `road-sign-street` (celui qui a un poteau), et non `road-sign-object-street` (plaque seule) ;
    - lampadaires : `LAMP_HEAD` (`assets.ts`), mesuré sur les modèles, donne la tête de lampe et l'orientation du bras (vers −z dans le repère du modèle).
19. **Exports en plus du contrat 9.2** : `carParkStalls`, `STALL_W = 3`, `STALL_D = 5` et `SOUTH_EXTRA_ROWS` dans `cityPlan.ts`. `RAMP` est exporté par `carMotion.ts`, comme prévu en 9.2.
20. **Ombres des arbres au palier `low`** : tous les arbres (square et cours, fusionnés en un seul mesh) ne projettent plus d'ombre au palier `low`, comme le mobilier (2.5, 2.6).

## 1. Fantasy

Mon agence est au cœur d'un vrai quartier vivant : taxis et camionnettes tournent autour des pâtés de maisons, mes voitures sortent du parking et filent en ville, le soleil tourne et dore les façades, puis le soir les lampadaires, l'enseigne « LOCATION » et les phares s'allument.

## 2. Rules

### 2.1 Plan du quartier (`cityPlan.ts`, pur)

Repère, `TILE = 6` et grille : ceux de `agency-view` 2.4. On note `sr = layout.streetRow` et `L = layout.lotCols`.

- **Rues** :
  - colonnes nord-sud `streetCols` = `{-2 - 4k} ∪ {L + 1 + 4k}`, pour `k = 0..CITY_BLOCKS` ;
  - rangées est-ouest `streetRows` = `{sr + 4k} ∪ {-3 - 4k}`, pour `k = 0..CITY_BLOCKS` ;
  - `CITY_BLOCKS = 3`.
- **Étendue** `extent` : une tuile au-delà des rues extrêmes, plus `SOUTH_EXTRA_ROWS = 6` rangées au sud (décision 17), soit les colonnes `[-3 - 12, L + 14]` et les rangées `[-16, sr + 19]`. Les rues vont d'un bord à l'autre. La bande sud ajoutée (rangées `sr + 13` à `sr + 19`) n'a pas de bloc : seules les rues nord-sud la traversent.
- **Tuiles** de rue : un `crossroad` à chaque croisement, un `straight` (turn 0 pour est-ouest, 1 pour nord-sud) ailleurs. Une `crossing` (passage piéton) sur les 4 bras des croisements de la rue principale `sr` dans les anneaux proches. L'entrée charretière reste celle de `layout`.
- **Blocs** : les cellules entre deux rues consécutives. Coordonnées de bloc `(i, j)` : `i` vers l'est, `j` vers le sud, le bloc de l'agence en `(0, 0)` (colonnes `-1..L`, rangées `-2..sr-1`). Anneau `ring = max(|i|, |j|)`.

| Bloc                         | Usage `BlockUse` | Contenu                                                                                                                                      |
| ---------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `(0, 0)`                     | `agency`         | `layout` (parking, agence) ; rangées `-2..-1` et cellules `(-1, 0)`, `(L, 0)` : bâtiments moyens                                             |
| `(0, 1)`                     | `park`           | rangée nord en trottoir avec parasols (café) une tuile sur deux ; le reste en gazon, avec 2 arbres par cellule et des lampadaires en bordure |
| `(-1, 1)`                    | `construction`   | sol de chantier, clôture `construction-fence` sur le pourtour, cônes, barrières, `construction-light`, `dumpster`, un camion garé            |
| `(1, 1)`                     | `carPark`        | `asphalt` (`road-square`), places peintes, voitures garées sur 60 % des places (hash), 2 lampadaires                                         |
| autres, `ring ≤ 2`, `j ≤ -1` | `tall`           | gratte-ciel `skyscraper-a…e` sur le pourtour, échelle 0,72                                                                                   |
| autres, `ring ≤ 2`           | `buildings`      | bâtiments moyens sur le pourtour, 1 à 3 arbres dans la cour centrale                                                                         |
| `ring = 3`, `j = -3`         | `farTall`        | gratte-ciel                                                                                                                                  |
| `ring = 3`, ailleurs         | `far`            | `low-detail-*` (dont `wide-a/b`) teintés `FAR_TINTS`, sans arbres ni lampadaires                                                             |

- **Cellules de bloc** : un `sidewalk` (`tile-low`), sauf le gazon (pas de tuile : le sol `grass` apparaît), l'`asphalt` et le sol de chantier.
- **Bâtiments** : un par cellule du pourtour, façade vers la rue la plus proche (`heading` 0 = sud, π/2 = est, π = nord, 3π/2 = ouest ; aux coins, la rue est-ouest l'emporte). Le variant vient de `cellHash(col, row, salt)`. Si c'est le même que le voisin précédent sur la même rue, on prend le suivant dans la liste.
- **Mobilier**, dans les anneaux ≤ 2 seulement :
  - un lampadaire `light-curved` toutes les 2 tuiles le long de chaque rue, en alternant les côtés, tourné vers la chaussée ;
  - deux `traffic-light` en coins opposés de chaque croisement de la rue principale ;
  - un panneau de rue aux 4 coins des deux carrefours de l'agence ;
  - un `dumpster` dans 1 cour sur 3.
- **Voitures garées le long des rues** (décor) : sur les voies de droite des blocs `agency` et `park` qui ne servent à aucun itinéraire (2.2). Une voiture tous les 7 m, décalée de 0,6 m vers le trottoir, dans le sens de la voie. Invariant : aucune voiture garée à moins de 3 m d'un itinéraire ou d'une boucle.
- **Déterminisme** : `computeCityPlan(layout)` est pur. L'aléa vient uniquement de `cellHash` (`prng.ts`, web), jamais de `rng.ts` de la sim.

### 2.2 Nos voitures en ville (`routes.ts`, `carMotion.ts`, purs)

- **Conduite à droite** : la voie d'un tronçon orienté est l'axe de la rue décalé de `LANE_OFFSET = 1,5` vers la droite du sens de marche. La droite de `(dx, dz)` est `(-dz, dx)`.
- **Départ** = `exitPath` (place → allée → voie de sortie → `(exitLaneX, laneOutZ)`), puis la route en ville :
  - vers l'est jusqu'au carrefour `E0 = (L + 1, sr)` ;
  - puis le motif `ROUTE_PATTERNS[index mod 6]`, une manœuvre par carrefour rencontré : `[S]`, `[R]`, `[L]`, `[S, R]`, `[R, L]`, `[L, R]` ;
  - puis tout droit jusqu'au bord de `extent`.
- **Retour** : le même trajet en ville parcouru à l'envers, donc sur les voies opposées. Il arrive à `E0` puis vers l'ouest sur `laneInZ` jusqu'à `returnPath` (`(exitLaneX, laneInZ)` → allée → place).
- **Virages** : chaque angle de la partie en ville est remplacé par un arc de rayon `TURN_RADIUS = 2,5`, échantillonné en 4 segments (`roundCorners`). Le cap suit la tangente ; `TURN_BLEND` reste appliqué aux angles de la partie parking.
- **Temps** : `DRIVE_MINUTES = 60`. Les phases sont celles de la rév. 6 (`departing`, `away`, `returning`, `parked`) avec cette durée. Invariant toujours vrai : `ret - 60 ≥ dep + 60`.
- **Profil de vitesse** (fraction de distance `s` en fonction de la fraction de temps `p`, `RAMP = 0,25`) :
  - au départ, `easeInCruise(p)` : `p² / (RAMP·(2 - RAMP))` si `p < RAMP`, sinon `(2p - RAMP) / (2 - RAMP)`. Démarrage doux, puis vitesse constante ;
  - au retour, `cruiseEaseOut(p) = 1 - easeInCruise(1 - p)`. Vitesse constante, puis freinage avant de se garer.
- **Opacité** : 1 pendant `departing` et `returning`, 0 pendant `away`. Le bord de `extent` est toujours hors champ (critère 2), donc aucune voiture n'apparaît ni ne disparaît à l'écran.
- **Roues, marche arrière, pastille, sélection, mouvement réduit** : inchangés (rév. 6).

### 2.3 Circulation de fond (`traffic.ts`, pur)

- **Temps d'ambiance** : `advanceAmbient(prev, dtMs, speed, paused) = prev + clamp(dtMs, 0, 250) / 1000 × ambientRate(speed, paused)`.
  - `ambientRate` vaut 0 en pause, puis 1, 1,5, 2 et 3 pour x1, x2, x4 et x10. Une vitesse inconnue compte comme x1.
  - Le temps d'ambiance n'est pas persisté et repart de 0 au montage.
- **Boucles** : une par bloc d'anneau ≤ 2, sauf `agency` et `park`, soit 23 boucles. Chaque boucle suit le tour du bloc dans le sens horaire, sur la voie de droite, avec les angles arrondis (`TURN_RADIUS`). Les champs `length`, `speed` (de 7 à 10 m/s d'ambiance, par hash), `capacity = min(3, floor(length / MIN_TRAFFIC_GAP))` et `rank` (ordre de distance au centre de l'agence) sont précalculés.
- **Véhicules** : `trafficVehicles(plan)` renvoie une liste fixe et ordonnée d'au plus `MAX_TRAFFIC = 24` véhicules.
  - Le véhicule `k` va sur la boucle de rang `k mod n` (`n` boucles), à l'offset `floor(k / n) × length / capacity + phase(loop)`.
  - Modèle : `TRAFFIC_MIX[k mod 15]`, soit taxi ×4, suv ×3, van ×2, delivery ×2, truck, police, ambulance, garbage-truck. On ne prend jamais un modèle de voiture du joueur.
  - On utilise toujours un **préfixe** de cette liste : réduire le nombre de véhicules ne fait que retirer les derniers, sans jamais en rapprocher deux.
- **Pose** : `trafficPoseAt(plan, v, t)` donne la position sur la boucle à la distance `(offset + speed·t) mod length`, le cap tangent et `distance = speed·t` (pour les roues). Pas de fondu : les boucles sont fermées.
- **Densité** : `trafficBudget(tier, driving) = max(trafficMin, trafficMax - floor(driving / 2))`, où `driving` est le nombre de nos voitures en `departing` ou `returning`. La glue n'applique un changement de visibilité qu'à un véhicule **hors écran** (`groundPointOnScreen` avec 40 px de marge) : on ne voit jamais une voiture apparaître ou disparaître.
- **Mouvement réduit** : pas de circulation de fond (0 véhicule). Les voitures garées du décor restent.

### 2.4 Cycle de lumière (`lighting.ts`, pur)

`lightAt(t)`, avec `t` = minutes depuis 09:00. Une valeur non finie compte comme 0 ; `t` est borné à `[0, 720]`. Interpolation linéaire entre deux keyframes : angles en degrés, intensités, et couleurs canal par canal en sRGB (`lerpColor`, canaux entiers arrondis).

| Minute (heure) | Couleurs `LIGHT_COLORS` | Azimut ° | Élévation ° | Soleil | Hémisphère | Ambiante |
| -------------- | ----------------------- | -------- | ----------- | ------ | ---------- | -------- |
| 0 (09:00)      | `morning`               | 115      | 30          | 2,2    | 0,90       | 0,15     |
| 150 (11:30)    | `noon`                  | 160      | 55          | 2,6    | 0,95       | 0,15     |
| 360 (15:00)    | `afternoon`             | 220      | 48          | 2,5    | 0,95       | 0,15     |
| 510 (17:30)    | `golden`                | 250      | 30          | 2,2    | 0,85       | 0,12     |
| 600 (19:00)    | `sunset`                | 262      | 18          | 1,7    | 0,70       | 0,10     |
| 660 (20:00)    | `dusk`                  | 272      | 13          | 1,1    | 0,60       | 0,10     |
| 720 (21:00)    | `late`                  | 280      | 12          | 0,6    | 0,50       | 0,12     |

- **Azimut** compté depuis le nord (−z), dans le sens horaire vers l'est (+x). Direction vers le soleil : `sunDir = (sin az·cos el, sin el, −cos az·cos el)`, vecteur unitaire. Élévation jamais sous `MIN_SUN_ELEVATION = 12°`, pour garder des ombres bornées ; le coucher se lit dans la couleur.
- **Couleurs** (`palette.ts`, `LIGHT_COLORS[key] = { sky, sun, hemiSky, hemiGround }`) : celles de `afternoon` sont celles de la rév. 6 (`sky 0xbfe3f2`, `sun 0xfff1d6`, `hemiSky 0xcfe8ff`, `hemiGround 0x9bb07a`). Valeurs de départ des autres :
  - `morning` : `0xcde9f6`, `0xfff4e2`, `0xd8eeff`, `0x9bb07a` ;
  - `noon` : `0xb4e0f4`, `0xfff6e8`, `0xcfe8ff`, `0x9bb07a` ;
  - `golden` : `0xf5dcb4`, `0xffd59e`, `0xf3dcc0`, `0x9a9f6e` ;
  - `sunset` : `0xf6b48a`, `0xffa463`, `0xf0c0a0`, `0x8a7f62` ;
  - `dusk` : `0xd98a7a`, `0xff8550`, `0xb79bb8`, `0x5f5a55` ;
  - `late` : `0x7a6a9c`, `0xff7a48`, `0x8c86b8`, `0x45475a`.

  Elles sont ajustables aux captures.

- **Soir** :
  - `lampGlow` vaut 0 avant `LAMPS_ON_MINUTE = 570` (18:30), monte linéairement jusqu'à 1 à `LAMPS_FULL_MINUTE = 585` (18:45), puis reste à 1 ;
  - `lampsOn = t ≥ 570` ;
  - `headlightsOn = t ≥ HEADLIGHTS_ON_MINUTE = 585`.

### 2.5 Éclairage du soir et ombres

- **Lampadaires** (`light-square` du parking, `light-curved` des rues) :
  - un halo additif `lampGlow` (billboard de 1,6 m) à la tête de chaque lampe. La position de la tête dans le modèle est donnée par `LAMP_HEAD` (`assets.ts`), mesurée sur le modèle ;
  - une flaque de lumière au sol (disque de 3 m de rayon, dégradé, opacité `0,35 × lampGlow`), absente au palier `low`.
- **Enseigne « LOCATION »** : face avant émissive (`emissiveMap` = texture de l'enseigne, intensité `1,2 × lampGlow`) et un halo derrière.
- **Phares** (toutes les voitures visibles en mouvement, plus les nôtres garées en `returning`) : si `headlightsOn`, deux halos blancs à l'avant, deux rouges à l'arrière, et un faisceau au sol (quad de 2,4 × 6 m, dégradé, devant la voiture). En tout, un `InstancedMesh` de halos et un de faisceaux.
- **Ombres** : le soleil de `lightAt` est la seule lumière à ombres. Son frustum est ajusté **dans les axes de la lumière** (`shadowFrustum(cam, view, sunDir)`, 8.2) à chaque frame tant que le temps défile, et à chaque changement en pause.
  - Projettent une ombre : bâtiments, mobilier et arbres (sauf au palier `low`, décision 20), voitures.
  - N'en projettent pas : tuiles, gazon, halos, faisceaux.

### 2.6 Performance et paliers de qualité (`quality.ts`, pur)

- **Cible** : 60 fps, et jamais moins de 30 fps, sur iPhone avec 50 voitures, la circulation au maximum du palier et 20:30 (le pire cas, avec les halos).
- **Budget** (mesuré par `renderer.info.render` après `render()`, toutes passes, ombres comprises, vue d'ensemble 390 × 844, palier `high`) :
  - au plus **250 draw calls** et au plus **1 000 000 triangles** par frame ;
  - reconstruction du décor en moins de 60 ms sur ordinateur (sans ralentissement) ;
  - calcul des poses et des matrices d'instance en moins de 2 ms par frame pour 74 véhicules ;
  - aucune allocation par frame dans les boucles chaudes (objets `Matrix4` et `Vector3` réutilisés).
  - Si le budget de triangles est dépassé, l'anneau 2 passe en `low-detail` teinté, et c'est consigné ici.
- **Paliers** :

| Palier   | Pixel ratio max | Shadow map | Ombres douces (`PCFSoft`) | Circulation max / min | Flaques au sol | Ombres du mobilier et des arbres |
| -------- | --------------- | ---------- | ------------------------- | --------------------- | -------------- | -------------------------------- |
| `high`   | 2               | 2048       | oui                       | 24 / 8                | oui            | oui                              |
| `medium` | 1,5             | 1024       | oui                       | 14 / 5                | oui            | oui                              |
| `low`    | 1               | 1024       | non (`PCF`)               | 6 / 2                 | non            | non                              |

- **Palier initial** `initialTier(hints)` :
  - `low` si `hardwareConcurrency ≤ 2`, `deviceMemory ≤ 2` ou `maxTextureSize < 4096` ;
  - `medium` si `hardwareConcurrency ≤ 4` et `deviceMemory ≤ 4`, tous deux connus ;
  - `high` sinon. Les indices absents ou non numériques sont ignorés.
- **Adaptation** `observeFrame(monitor, tier, dtMs, nowMs)`, alimentée seulement pendant que le temps défile :
  - les `dt > 250` ms ou non finis sont ignorés ;
  - on calcule une moyenne par fenêtre de 60 frames ; une fenêtre est lente si sa moyenne dépasse 24 ms ;
  - après 2 fenêtres lentes consécutives, on descend d'un palier, au plus une fois toutes les 5 s ;
  - on ne remonte jamais pendant la session.

### 2.7 Reprises de la revue d'`agency-view`

1. **Frustum d'ombre dans les axes de la lumière** (2.5, 8.2), à la place du carré aligné sur le monde.
2. **`Scene.create` sauté si l'effet est déjà annulé** : `AgencyView` teste `cancelled` après l'`import()` et ne crée rien ; `create` teste `isCancelled()` avant de créer le renderer.
3. **Code mort supprimé** dans `AgencyScene3D.ts` : le ternaire `p.kind === "lamp" ? 0 : 0`, les secours `?? CAR_ASSET.unknown` sur les gabarits de l'agence et de l'auvent, et `+ 0.0`.
4. **Modèles chargés en retard libérés** : si le délai expire, ou si un chargement échoue ou que la création est annulée, chaque `loadAsync` encore en cours reçoit une suite qui `dispose()` ses géométries, matériaux et textures dès qu'il se termine.

## 3. State

- **Sim** : inchangé.
- **Web** : `UiState` est inchangé. `AgencyView` reçoit en plus `speed` (prop).
- **État local de la vue**, jamais persisté : temps d'ambiance, `FrameMonitor`, palier, plan de ville en cache (clé `columns × rows`) et itinéraires en cache.
- **Scène 3D** : instancieurs de voitures, décor de la ville, calques de lumière du soir.

## 4. Player actions

Aucune nouvelle action. Effets sur les actions existantes :

| Action                       | Effet nouveau                                                                                                                                     | Cas invalides                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Pause                        | Figent : la lumière, la circulation (temps d'ambiance arrêté), les roues, les halos.                                                              | aucun                                                     |
| x1 / x2 / x4 / x10           | Le soleil tourne au rythme du temps de jeu ; la circulation accélère en douceur (×1 à ×3).                                                        | Une vitesse forgée compte comme x1 pour l'ambiance.       |
| Acheter                      | La nouvelle voiture apparaît garée. Si `rows` change, le quartier est reconstruit (petit à-coup accepté), à l'identique hors du bloc de l'agence. | inchangés                                                 |
| Toucher une voiture          | Seules nos voitures sont touchables. Toucher un taxi ou une voiture garée du décor ne fait rien (et ferme l'infobulle ouverte).                   | Une voiture `away` (au-delà du bord) n'est pas touchable. |
| Glisser / pincer / Recentrer | inchangés : bornes de l'agence.                                                                                                                   | inchangés                                                 |
| Mouvement réduit             | Pas de circulation de fond, nos voitures ne roulent pas (rév. 6) ; la lumière change quand même.                                                  | —                                                         |

## 5. UI

- Aucun nouvel élément d'interface. Le HUD, la feuille, la bannière et l'infobulle sont inchangés.
- **Chargement** : `agency-loading` affiche « Chargement de la ville… 42 % » (modèles chargés sur le total, arrondi, de 0 à 100). Si `total = 0`, le pourcentage est omis.
- **`agency-view`**, attributs de diagnostic lus par la fumée et les captures, jamais affichés :
  - `data-quality` (`high | medium | low`) ;
  - `data-traffic` (véhicules de fond visibles) ;
  - `data-draw-calls` et `data-triangles`, mis à jour au plus 2 fois par seconde.

## 6. Server

Rien. Les nouveaux `.glb` sont des fichiers statiques déjà mis en cache par le service worker.

## 7. Rendu

Exigences « ⭐ » du ROADMAP couvertes par cette feature :

- **Quartier complet** : grille de rues Kenney avec carrefours, passages piétons, feux, panneaux et lampadaires courbes. Blocs de bâtiments commerciaux variés (13 modèles, tournés vers leur rue), trottoirs, square arboré avec terrasse de café, parking de quartier plein de voitures, chantier clôturé, gratte-ciel en fond nord. Bloc lointain en `low-detail` teinté chaud, jamais gris pâle uniforme.
- **Vue d'ensemble 390 px** : l'agence reste au centre et lisible. Le haut de l'écran montre une ligne d'immeubles et de gratte-ciel, le bas le square, le chantier et le parking de quartier, des rues animées sur les côtés. On ne voit jamais de grand aplat vide ni le bord du monde.
- **Zoom maximal** : façades texturées, arbres à ombrage plat, roues qui tournent, ombres nettes (frustum ajusté dans les axes de la lumière).
- **Voitures** : les nôtres sortent du parking, tournent aux carrefours et s'enfoncent dans la ville. Taxis, SUV, camionnettes, livraisons, camion, police, ambulance et benne tournent autour des pâtés de maisons, roues en mouvement, sur leur voie, sans traverser un bâtiment ni une autre voiture de fond.
- **Lumière** : matin clair et frais avec des ombres longues vers l'ouest-nord-ouest ; midi chaud avec des ombres courtes ; fin d'après-midi dorée ; coucher orangé puis crépuscule mauve. Le ciel et l'hémisphère suivent.
- **Soir** : à partir de 18:30, les lampadaires s'allument (halo et flaque de lumière), l'enseigne « LOCATION » rayonne ; à 18:45, phares et feux arrière. À 20:30 la scène reste lisible : voitures distinguables, agence identifiable.
- **Couleurs** : toutes dans `palette.ts` (`LIGHT_COLORS`, `SCENE_COLORS` étendu : `lampGlow 0xffd58a`, `headlight 0xfff2c8`, `taillight 0xff4a3d`, `treeLeaves [0x6fbf73, 0x4f9d69, 0x8cc084]`, `treeTrunk 0x8a5a3b`, `constructionGround 0xc9a77c`, `FAR_TINTS [0xd9a07a, 0xc9b79c, 0xe3c9a0, 0xb98b73]`).

## 8. Acceptance criteria

Logique pure (Vitest, sans WebGL) :

1. **Plan** :
   - pour chaque taille de flotte de 0 à 50, il est identique d'un appel à l'autre ;
   - aucune cellule n'a deux tuiles et aucun bâtiment n'est posé sur une rue ;
   - les rues forment une grille connexe qui contient la rue de l'agence et ses deux rues transversales ;
   - au moins 10 modèles de bâtiment différents sont utilisés, et deux voisins sur la même rue ne sont jamais identiques ;
   - au sud de la rue principale, les trois blocs voisins de l'agence n'ont aucun bâtiment, et les gratte-ciel ne sont que dans les blocs `j ≤ -1`.
2. **Bord du monde** : pour la caméra d'ensemble à 390 × 844, 1280 × 800 et 2560 × 1080, et pour toutes les tailles de flotte, les 4 coins de l'écran projetés au sol sont à l'intérieur de `extent`, à plus de 12 m du bord.
3. **Itinéraires** :
   - pour les index de 0 à 49 et dans les deux sens, chaque point est sur le parking, l'entrée charretière ou une tuile de rue ;
   - en ville, chaque point est du côté droit du sens de marche ;
   - les itinéraires ne changent de direction qu'aux carrefours et finissent au bord de `extent` ;
   - les 6 motifs apparaissent pour les index 0 à 5.
4. **Mouvement de nos voitures** :
   - pas de saut entre deux instants proches, `DRIVE_MINUTES = 60`, retour garé avant 21:00 ;
   - l'opacité vaut 0 ou 1 ;
   - le départ démarre doucement et le retour freine avant la place ;
   - en mouvement réduit, la voiture ne roule pas.
5. **Circulation** :
   - même entrée, même pose ; entre deux instants d'ambiance proches, petit déplacement ;
   - toute pose est sur une tuile de rue, du côté droit ;
   - sur une période complète échantillonnée, deux véhicules de fond **de la même boucle** ne sont jamais à moins de `MIN_TRAFFIC_GAP`. Entre boucles voisines, deux véhicules peuvent se croiser à environ 3 m sur les voies opposées d'une même rue : c'est accepté (décision 16) ;
   - la liste est un préfixe stable ;
   - `trafficBudget` diminue quand le nombre de nos voitures en route augmente, sans descendre sous le minimum du palier ;
   - `advanceAmbient` ne bouge pas en pause et borne `dt` à 250 ms ;
   - aucun véhicule de fond n'a l'asset d'une voiture du joueur.
6. **`lightAt`** :
   - exact aux keyframes et continu entre elles ;
   - `sunDir` unitaire, avec une élévation entre 12° et 60° ;
   - soleil à l'est le matin (`x > 0`) et à l'ouest le soir (`x < 0`), intensité décroissante de 15:00 à 21:00 ;
   - `lampsOn` faux à 18:29 et vrai à 18:30, `lampGlow` à 1 à 18:45, `headlightsOn` à partir de 18:45 ;
   - une entrée non finie donne 09:00 ;
   - couleurs entières de `0x000000` à `0xffffff`.
7. **`shadowFrustum`** : la base de la lumière est orthonormée. Le rectangle contient les coins visibles projetés à `y = 0` et à `y = RECEIVER_HEIGHT`, ses demi-tailles sont finies et strictement positives, et son centre est au sol.
8. **Paliers** :
   - `initialTier` suit 2.6 et ignore les indices absurdes ;
   - `observeFrame` descend après 2 fenêtres lentes, ne remonte jamais, ignore les `dt > 250` et change au plus une fois toutes les 5 s.
9. **Assets** : chaque nouvel `AssetRef` existe dans `public/assets`. `three` n'est importé que par `scene/AgencyScene3D.ts` et `scene/gl/*.ts`.

DOM (jsdom, loader simulé) :

10. Sous StrictMode, `create` n'est appelé qu'une fois pour l'effet conservé. Un modèle qui se charge après le délai voit ses géométries libérées. Le message de chargement affiche un pourcentage qui progresse.
11. En pause, deux rendus successifs donnent les mêmes poses de circulation. `AgencyView` reçoit `speed`, et `data-quality` est présent dès que la vue est prête.

Fumée et captures (Playwright-MCP, émulation 390 × 844, `screenshots/city-life/`) :

12. `city-life-0900.png` : lumière claire, ombres longues vers l'ouest-nord-ouest, quartier dense et varié, circulation visible.
13. `city-life-1500.png` et `city-life-1500-zoom.png` (zoom maximal sur le carrefour `E0`) : lumière chaude, façades et arbres détaillés, ombres nettes.
14. `city-life-1845.png` : lampadaires, enseigne et phares allumés, ciel doré.
15. `city-life-2030.png` : coucher orangé et mauve, flaques de lumière, phares. Les voitures et l'agence restent lisibles.
16. `city-life-0920-moving.png` : une de nos voitures tourne à un carrefour et s'enfonce en ville, roues en mouvement. À l'écran, aucune voiture n'apparaît, ne disparaît ou ne traverse un bâtiment.
17. `city-life-desktop-1500.png` (1280 × 800) : même richesse, bord du monde invisible.
18. **Performance** :
    - avec 50 voitures (même méthode qu'`agency-view` critère 17), circulation au maximum et 20:30, 30 fps ou plus en émulation avec le CPU ralenti 4× ;
    - `data-draw-calls` ≤ 250 et `data-triangles` ≤ 1 000 000 au palier `high` (valeurs relevées dans la PR) ;
    - un ralentissement forcé fait passer `data-quality` à `medium` puis à `low` ;
    - 30 jours à x10 sans croissance mémoire ni erreur en console.
19. **Pause et vitesses** : en pause, tout est figé (lumière, circulation, roues). À x10, la circulation va 3 fois plus vite qu'à x1, sans saut. Le passage de 21:00 à 09:00 change la lumière en même temps que la bannière.
20. `npm run check` est vert. Aucun hex brut hors de `scene/palette.ts`. Le `reviewer` refuse le rendu dans ces cas :
    - bâtiments identiques alignés, blocs vides ;
    - tours pâles non teintées, cubes de couleur ;
    - ombres incohérentes avec le soleil ;
    - nuit illisible ;
    - voiture qui surgit ou disparaît à l'écran.

## 9. Split

**sim-engineer** : rien. **backend-engineer** : rien. Aucun changement sim : `departureMinute`, `returnMinute`, `DAY_MINUTES` et `MAX_FLEET_SIZE` suffisent.

### 9.1 Modules

| Module                                                                                             | Sort                                                                                          |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `scene/prng.ts`, `cityPlan.ts`, `paths.ts`, `routes.ts`, `traffic.ts`, `lighting.ts`, `quality.ts` | **nouveaux**, purs                                                                            |
| `scene/layout.ts`                                                                                  | **réduit** au bloc de l'agence (le reste passe à `cityPlan`), types étendus                   |
| `scene/carMotion.ts`                                                                               | **adapté** : itinéraires, `DRIVE_MINUTES = 60`, profils, opacité 0/1                          |
| `scene/iso.ts`                                                                                     | **adapté** : `lightBasis`, `shadowFrustum` dans les axes de la lumière, `groundPointOnScreen` |
| `scene/assets.ts`, `scene/palette.ts`                                                              | **étendus**                                                                                   |
| `scene/gl/loader.ts`, `gl/cityMesh.ts`, `gl/carInstances.ts`, `gl/nightLights.ts`                  | **nouveaux**, glue Three.js (seuls autorisés à importer `three`, avec `AgencyScene3D.ts`)     |
| `scene/AgencyScene3D.ts`                                                                           | **adapté** : orchestration, lumière, paliers, nettoyage (2.7)                                 |
| `components/AgencyView.tsx`, `App.tsx`                                                             | **adaptés** : `speed`, temps d'ambiance, moniteur de frames, création annulée, progression    |

### 9.2 Contrat (modules purs, sans `three` ni DOM)

```ts
// scene/prng.ts : aléa déterministe du rendu, indépendant de rng.ts de la sim
export const CITY_SEED = 0x5eedc17;
export function cellHash(col: number, row: number, salt: number): number; // [0, 1), stable, sans état

// scene/layout.ts (réduit). Supprimés : ROAD_EXTEND_TILES, DECOR_RING_TILES, exitEndX.
export type RoadTileKind =
  "straight" | "crossroad" | "crossing" | "driveway" | "sidewalk" | "asphalt";
export type PropKind =
  | "agency"
  | "awning"
  | "sign"
  | "parasol"
  | "lamp"
  | "building"
  | "backdrop"
  | "lowBuilding"
  | "streetLamp"
  | "trafficLight"
  | "streetSign"
  | "construction"
  | "dumpster"
  | "tree"
  | "parkedCar";
export interface PropPlacement {
  readonly kind: PropKind;
  readonly variant: number;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly scale: number; // multiplicateur de l'échelle du kit (1 par défaut)
  readonly tint: number; // index dans FAR_TINTS / treeLeaves, -1 = couleur d'origine
}
// AgencyLayout : mêmes champs sauf exitEndX ; tiles/props = bloc de l'agence seulement
// (trottoirs du parking, entrée charretière, agence, auvent, enseigne, parasols, lampes du parking).
export function exitPath(layout: AgencyLayout, index: number): readonly GroundPoint[]; // place → … → (exitLaneX, laneOutZ)
export function returnPath(layout: AgencyLayout, index: number): readonly GroundPoint[]; // (exitLaneX, laneInZ) → … → place

// scene/cityPlan.ts
export const CITY_BLOCKS = 3,
  NEAR_RING = 2,
  MIN_TRAFFIC_GAP = 12,
  TURN_RADIUS = 2.5;
export interface Extent {
  readonly colMin: number;
  readonly colMax: number;
  readonly rowMin: number;
  readonly rowMax: number;
} // inclus
export type BlockUse =
  "agency" | "park" | "carPark" | "construction" | "buildings" | "tall" | "far" | "farTall";
export interface Block {
  readonly i: number;
  readonly j: number;
  readonly cells: Extent;
  readonly use: BlockUse;
}
export interface TrafficLoop {
  readonly block: number;
  readonly path: readonly GroundPoint[]; // fermé, sens horaire, voie de droite, angles arrondis
  readonly length: number;
  readonly speed: number;
  readonly capacity: number;
  readonly rank: number;
  readonly phase: number;
}
export interface CityPlan {
  readonly extent: Extent;
  readonly streetCols: readonly number[];
  readonly streetRows: readonly number[]; // croissants
  readonly blocks: readonly Block[];
  readonly tiles: readonly TilePlacement[]; // aucune cellule commune avec layout.tiles
  readonly props: readonly PropPlacement[]; // dont parkedCar (variant = index dans TRAFFIC_MODELS)
  readonly loops: readonly TrafficLoop[]; // triées par rank
}
export function computeCityPlan(layout: AgencyLayout): CityPlan; // pur, ne lève jamais
export function isStreetCell(plan: CityPlan, col: number, row: number): boolean;
// rév. 2 (décisions 17 et 19) :
export const SOUTH_EXTRA_ROWS = 6;
export const STALL_W = 3,
  STALL_D = 5;
export interface CarParkStall {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}
export function carParkStalls(block: Block): readonly CarParkStall[]; // places du parking de quartier

// scene/paths.ts
export interface PathSample {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}
export function laneOffset(centerline: readonly GroundPoint[], offset: number): GroundPoint[]; // à droite du sens de marche
export function roundCorners(
  points: readonly GroundPoint[],
  radius: number,
  closed: boolean,
): GroundPoint[]; // 4 segments par arc
export function pathLength(points: readonly GroundPoint[], closed: boolean): number;
export function sampleAt(
  points: readonly GroundPoint[],
  distance: number,
  closed: boolean,
): PathSample; // borné (ouvert) ou modulo (fermé) ; jamais NaN

// scene/routes.ts
export type Turn = "S" | "R" | "L";
export const ROUTE_PATTERNS: readonly (readonly Turn[])[]; // [S] [R] [L] [S,R] [R,L] [L,R]
export interface CarRoutes {
  readonly departure: readonly (readonly GroundPoint[])[]; // index = place
  readonly arrival: readonly (readonly GroundPoint[])[];
}
export function carRoutes(layout: AgencyLayout, plan: CityPlan): CarRoutes;

// scene/carMotion.ts (adapté ; CarPose, CarPhase, carPhaseAt, carIndexAt, CAR_BOX, WHEEL_RADIUS inchangés)
export const DRIVE_MINUTES = 60,
  RAMP = 0.25;
export function easeInCruise(p: number): number; // [0,1] → [0,1], croissante
export function cruiseEaseOut(p: number): number; // 1 - easeInCruise(1 - p)
export function carPoseAt(
  layout: AgencyLayout,
  routes: CarRoutes,
  index: number,
  rented: unknown,
  timeOfDay: number,
  reducedMotion: boolean,
): CarPose; // alpha ∈ {0, 1}

// scene/traffic.ts
export type TrafficModel =
  "taxi" | "suv" | "van" | "delivery" | "truck" | "police" | "ambulance" | "garbage-truck";
export const TRAFFIC_MODELS: readonly TrafficModel[];
export const TRAFFIC_MIX: readonly TrafficModel[]; // 15 entrées (2.3)
export const MAX_TRAFFIC = 24;
export const AMBIENT_RATE: Readonly<Record<1 | 2 | 4 | 10, number>>; // 1, 1.5, 2, 3
export function ambientRate(speed: unknown, paused: boolean): number;
export function advanceAmbient(prev: number, dtMs: number, speed: unknown, paused: boolean): number; // prev non fini → 0
export interface TrafficVehicle {
  readonly id: number;
  readonly loop: number;
  readonly offset: number;
  readonly model: TrafficModel;
}
export function trafficVehicles(plan: CityPlan): readonly TrafficVehicle[];
export interface VehiclePose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly distance: number;
}
export function trafficPoseAt(
  plan: CityPlan,
  v: TrafficVehicle,
  ambientSeconds: number,
): VehiclePose;
export function trafficBudget(tier: QualityTier, playerCarsDriving: number): number;

// scene/lighting.ts
export type LightKey = "morning" | "noon" | "afternoon" | "golden" | "sunset" | "dusk" | "late";
export interface LightKeyframe {
  readonly minute: number;
  readonly key: LightKey;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly sunIntensity: number;
  readonly hemiIntensity: number;
  readonly ambientIntensity: number;
}
export const LIGHT_KEYFRAMES: readonly LightKeyframe[]; // tableau 2.4, minutes croissantes de 0 à 720
export const MIN_SUN_ELEVATION_DEG = 12,
  LAMPS_ON_MINUTE = 570,
  LAMPS_FULL_MINUTE = 585,
  HEADLIGHTS_ON_MINUTE = 585;
export interface LightState {
  readonly sunDir: Point3;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly ambientIntensity: number;
  readonly sky: number;
  readonly lampGlow: number;
  readonly lampsOn: boolean;
  readonly headlightsOn: boolean;
}
export function lerpColor(a: number, b: number, t: number): number;
export function lightAt(timeOfDay: number): LightState;

// scene/quality.ts
export type QualityTier = "high" | "medium" | "low";
export interface TierSettings {
  readonly pixelRatioCap: number;
  readonly shadowMapSize: number;
  readonly softShadows: boolean;
  readonly trafficMax: number;
  readonly trafficMin: number;
  readonly lampPools: boolean;
  readonly propShadows: boolean;
}
export const TIER_SETTINGS: Readonly<Record<QualityTier, TierSettings>>; // tableau 2.6
export interface DeviceHints {
  readonly hardwareConcurrency?: unknown;
  readonly deviceMemory?: unknown;
  readonly maxTextureSize?: unknown;
}
export function initialTier(h: DeviceHints): QualityTier;
export interface FrameMonitor {
  readonly sum: number;
  readonly count: number;
  readonly slowWindows: number;
  readonly lastChangeMs: number;
}
export const INITIAL_MONITOR: FrameMonitor;
export const FRAME_WINDOW = 60,
  SLOW_FRAME_MS = 24,
  SLOW_WINDOWS = 2,
  TIER_COOLDOWN_MS = 5000;
export function observeFrame(
  m: FrameMonitor,
  tier: QualityTier,
  dtMs: number,
  nowMs: number,
): { readonly monitor: FrameMonitor; readonly tier: QualityTier };

// scene/iso.ts (adapté)
export const SHADOW_MARGIN = 6,
  RECEIVER_HEIGHT = 12;
export function lightBasis(sunDir: Point3): { readonly right: Point3; readonly up: Point3 };
//   right = normalize(Y × sunDir), up = sunDir × right (convention lookAt de three)
export function shadowFrustum(
  cam: Camera,
  view: ScreenRect,
  sunDir: Point3,
): {
  readonly center: GroundPoint;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly up: Point3;
}; // coins écran au sol (y = 0 et y = RECEIVER_HEIGHT) → axes lumière → rectangle + marge ; centre ramené au sol le long de sunDir
export function groundPointOnScreen(
  cam: Camera,
  view: ScreenRect,
  p: Point3,
  marginPx: number,
): boolean;

// scene/assets.ts (étendu)
// ROAD_TILE_ASSET : + crossing → road-crossing, asphalt → road-square
// PROP_ASSETS : building → building-a…g, i…n ; lowBuilding → low-detail-building-a…n, -wide-a, -wide-b ;
//   streetLamp → [light-curved] ; trafficLight → [traffic-light] ; streetSign → [road-sign-street]
//   (celui qui a un poteau ; -object- n'est que la plaque, décision 18) ;
//   construction → [construction-fence, construction-barrier, construction-cone, construction-light] ;
//   dumpster → [dumpster] ; tree → [] (procédural) ; parkedCar → [] (voir TRAFFIC_ASSET)
export const TRAFFIC_ASSET: Readonly<Record<TrafficModel, AssetRef>>; // cars/{nom}
export const LAMP_HEAD: Readonly<Record<string, Point3>>; // tête de lampe dans le repère du modèle (bras vers −z), light-square et light-curved
export const LOW_BUILDING_SCALE = 4.2;
// requiredAssets() inclut tout cela, dédupliqué.

// scene/palette.ts (étendu ; SCENE_COLORS.sky/sun/hemi* remplacés par LIGHT_COLORS)
export const LIGHT_COLORS: Readonly<
  Record<LightKey, { sky: number; sun: number; hemiSky: number; hemiGround: number }>
>;
export const SCENE_COLORS: Readonly<{
  lampGlow: number;
  headlight: number;
  taillight: number;
  treeLeaves: readonly number[];
  treeTrunk: number;
  constructionGround: number;
}>;
export const FAR_TINTS: readonly number[];
```

### 9.3 Glue Three.js

```ts
// scene/AgencyScene3D.ts
export interface SceneOptions {
  readonly palette: Palette;
  readonly reducedMotion: boolean;
  readonly size: { width: number; height: number };
  readonly baseUrl: string;
  readonly isCancelled: () => boolean;
  readonly loadTimeoutMs?: number;
  readonly tier: QualityTier;
  readonly onProgress?: (loaded: number, total: number) => void;
}
export class AgencyScene3D {
  static create(host: HTMLElement, o: SceneOptions): Promise<AgencyScene3D>; // isCancelled() testé avant le renderer
  update(game: GameState, timeOfDay: number, layout: AgencyLayout, ambientSeconds: number): void;
  setCamera(cam: Camera, view: ScreenRect): void;
  setQuality(tier: QualityTier): void; // pixel ratio, shadow map (libère l'ancienne), type d'ombre, budget de circulation
  stats(): { readonly calls: number; readonly triangles: number; readonly traffic: number };
  // setHighlight, setReducedMotion, posesNow, render, onFailure, destroy : inchangés
}
// scene/gl/loader.ts      : loadTemplates(refs, baseUrl, timeoutMs, onProgress, isCancelled) ; libère les chargements tardifs (2.7.4)
// scene/gl/cityMesh.ts    : décor depuis layout + CityPlan ; un InstancedMesh par (asset, mesh), bounding sphere calculée ;
//                           arbres, sol, dalle et traits en meshes procéduraux fusionnés par matériau ; tiles sans castShadow
// scene/gl/carInstances.ts : InstancedMesh par (modèle, carrosserie) et (modèle, roues) ; teinte joueur par instanceColor
//                           + shader de peinture ; voiture cachée = matrice d'échelle 0
// scene/gl/nightLights.ts : halos (1 InstancedMesh, billboards orientés une fois face à la caméra), flaques, faisceaux ; uniform lampGlow
```

`AgencyView` :

- reçoit `speed` ;
- à chaque frame où le temps défile, avance `ambientRef` avec `advanceAmbient` (dt depuis le timestamp rAF, remis à zéro à la reprise) et alimente `observeFrame`. Si le palier change, appelle `setQuality` ;
- écrit les attributs de diagnostic (5) ;
- sort sans appeler `create` si `cancelled` après l'`import()`.

`App.tsx` passe `ui.speed`.

### 9.4 Ordre

1. **Phase A, en parallèle** :
   - **frontend-engineer** écrit les modules purs de 9.2 et réduit `layout.ts`. Tant que la glue n'est pas réécrite, `AgencyScene3D` peut appeler `computeCityPlan` et ne dessiner que les tuiles, pour garder une compilation verte ;
   - **qa-breaker** écrit `cityPlan.test.ts`, `paths.test.ts`, `routes.test.ts`, `traffic.test.ts`, `lighting.test.ts`, `quality.test.ts` et `prng.test.ts`, et adapte `layout.test.ts`, `carMotion.test.ts`, `iso.test.ts`, `assets.test.ts` et `palette*.test.ts` (critères 1 à 9).
2. **Phase B, en parallèle** :
   - **frontend-engineer** écrit `scene/gl/*`, adapte `AgencyScene3D.ts`, `AgencyView.tsx` et `App.tsx`, applique 2.7, puis règle `LAMP_HEAD`, `ASSET_TURN_OFFSET` et les couleurs en regardant la scène ;
   - **qa-breaker** écrit les tests DOM (critères 10 et 11) et met à jour le test « `three` importé seulement par… ».
3. **Phase C** :
   - fumée et performance (critères 12 à 19), avec les valeurs de draw calls et de triangles relevées dans la PR ;
   - captures `/shot` : partie de 6 voitures (3 occasions, 2 citadines, 1 hybride, dont 2 à 200 €) ;
   - `npm run check` ;
   - passage du **reviewer**.

## 10. Proposals (hors périmètre)

- Glisser pour explorer la ville au-delà de l'agence (bornes de caméra élargies).
- Arrêt aux feux avec files d'attente.
- Fenêtres éclairées le soir.
- Poteaux électriques.
- Piétons avec un kit de personnages.
- Rotation de caméra par quarts de tour.

## Open questions

Aucune bloquante. Voir `docs/QUESTIONS.md`, section « city-life ».
