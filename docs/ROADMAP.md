# Roadmap

Objectif : que Rental Tycoon ressemble à un **tycoon mobile moderne** de l'App Store (temps réel, retour visuel permanent, progression, objectifs, rétention).

Chaque point passe par `/feature <description>` (spec courte seulement si le point est gros). Un point = un commit.

Légende : ✅ fait · 🚧 en cours · ⬜ à faire

## ⭐ Priorité transversale : des graphismes 3D DÉTAILLÉS

**C'est l'exigence n°1 du propriétaire du jeu.** Les tycoons de l'App Store se vendent d'abord sur leur rendu : la vue doit donner envie de la regarder et de zoomer dessus. Pas de cubes de couleur, pas de « placeholder qu'on améliorera plus tard ».

### Décision : rendu 3D isométrique avec Three.js (remplace PixiJS)

- **Moteur** : `three` (installé dans `apps/web`, avec `@types/three`). PixiJS (`pixi.js`) devient obsolète : ne plus l'utiliser pour du nouveau rendu ; le retirer de `package.json` est une décision humaine (manifeste protégé), le signaler dans `docs/QUESTIONS.md` une fois la scène Three.js terminée.
- **Style** : 3D low-poly isométrique, caméra **orthographique** en vue 3/4 plongeante (type _Idle Airport Tycoon_, _Idle Car Wash_, _Pocket City_), palette chaude et saturée.
- **Assets fournis (CC0, Kenney)** dans `apps/web/public/assets/` — **les utiliser en priorité**, ne pas redessiner ce qui existe déjà :
  - `cars/` (Car Kit) : `sedan`, `sedan-sports`, `hatchback-sports`, `suv`, `suv-luxury`, `van`, `delivery`, `truck`, `taxi`, `police`, `ambulance`… + `cone`, `box`, débris (pannes), roues séparées. Chaque voiture = carrosserie + 4 nœuds de roue (animables).
  - `roads/` (City Kit Roads, 95 éléments) : tuiles de route (droite, virage, croisement, T, fin), marquages, lampadaires, panneaux, barrières de chantier, ponts.
  - `city/` (City Kit Commercial, 41 éléments) : bâtiments, commerces, gratte-ciels, auvents, détails.
  - `characters/` (Mini Characters) : PNJ / clients `character-female-a…f` et `character-male-a…f`, animés (skinned : cloner avec `SkeletonUtils.clone`) : `idle`, `walk`, `sprint`, `sit`, `drive`, `pick-up`, `emote-yes`, `emote-no`, `interact-left/right`… + accessoires (`aid-*`, fauteuils roulants). À utiliser pour « Clients visibles ».
  - Chaque kit a son `Textures/colormap.png` (référencé par les `.glb` en chemin relatif : garder cette structure) et son `LICENSE.txt`.
  - Les `.glb` sont mis en cache hors ligne par le service worker au premier chargement (`vite.config.ts`, `runtimeCaching`).
  - Charger via `GLTFLoader` (`three/examples/jsm/loaders/GLTFLoader.js`) avec une URL préfixée par `import.meta.env.BASE_URL` (le jeu est servi sous `/Rental-Tycoon/` sur GitHub Pages).
- **Correspondance modèles de jeu → assets** (à figer dans une spec) : occasion → `hatchback-sports` ou `sedan` teinte terne, citadine neuve → `sedan`, berline hybride → `sedan-sports` / `suv-luxury` ; futurs modèles : `suv`, `van`, `delivery`, `truck`, `taxi`.

### Exigences pour **chaque** feature qui touche à l'affichage

- **Scène** : le parking de l'agence posé dans un vrai **quartier** construit avec les kits (routes tuilées autour, croisements, bâtiments commerciaux voisins, trottoirs, lampadaires, panneaux), pour que la scène ne flotte jamais dans le vide. Places de parking marquées, bâtiment de l'agence identifiable (enseigne, auvent).
- **Voitures** : modèles Kenney, plusieurs couleurs de carrosserie (variation de matériau/teinte), roues qui tournent en roulant, voitures qui **roulent sur les routes** (trajets le long des tuiles, virages, pas de téléportation) pour partir en location et revenir.
- **Lumière et ambiance** : `DirectionalLight` avec **ombres portées** (shadow map ajustée à la zone visible), lumière d'ambiance/hémisphère ; la couleur et l'angle du soleil évoluent de 09:00 à 21:00 (matin clair → coucher de soleil orangé) ; lampadaires et enseigne qui s'allument le soir ; phares des voitures le soir.
- **Vie** : personnages ou silhouettes simples qui viennent au comptoir, circulation de fond (voitures non-joueur sur les routes), particules (pièces, « +90 € » flottants en sprites/HTML au-dessus des voitures, confettis aux paliers).
- **Caméra** : glisser pour se déplacer, pincer pour zoomer (bornes), éventuellement rotation par quarts de tour ; démarrage en vue d'ensemble ; tap sur une voiture = sélection (raycast) qui ouvre ses infos.
- **UI au niveau** : cartes de modèles avec **vignette 3D** de la voiture (rendue par Three.js hors écran, ou vignettes générées une fois), icônes dessinées, boutons avec relief et état pressé, barres de progression, micro-animations sur tout ce qui change.

### Contraintes techniques

- **Performance iPhone** : 60 fps visés, 30 fps minimum, avec 50+ voitures. Charger chaque `.glb` une seule fois et **cloner** (ou `InstancedMesh` pour le décor répété : tuiles de route, lampadaires) ; `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` ; une seule lumière à ombres ; libérer (`dispose`) géométries/matériaux/renderer au démontage ; mettre le rendu en pause quand l'onglet est caché.
- **Repli** : si WebGL est indisponible ou si un `.glb` ne charge pas, le jeu reste jouable (panneaux React) avec un message clair — jamais d'écran blanc.
- **Tests** : la logique de scène pure (placement, trajets, correspondance modèle → asset, heure → lumière) dans des modules testables sans WebGL ; jsdom n'a pas de WebGL, ne pas instancier `WebGLRenderer` dans les tests unitaires.
- Couleurs de l'UI via `tokens.css` ; couleurs 3D (ciel, lumières) centralisées dans un module de palette de scène.
- Les features visuelles se terminent par une capture d'écran (`/shot`, iPhone 390 px portrait) dans `screenshots/`.

## Phase 0 — Déjà fait

- ✅ Boucle de base : flotte, locations journalières, charges fixes (`core-loop.md`)
- ✅ Première partie jouable : achat, prix, HUD (`first-playable.md`)
- ✅ PWA installable sur iPhone, déployée sur GitHub Pages
- ✅ Journées 09:00–21:00, temps continu avec vitesses, vue de l'agence en 3D Three.js (`agency-view.md`) — fait avec le changement de moteur :
  1. Garder et terminer la partie **sim** (`time.ts`, journée d'ouverture, encaissement en direct) et la partie **horloge / vitesses / HUD** côté web : elles ne dépendent pas du moteur de rendu.
  2. Réviser la spec (`agency-view.md`, nouvelle révision) : la vue PixiJS 2D est remplacée par la **scène 3D Three.js** décrite ci-dessus ; les comportements de la spec (pastilles, sélection, gestes, caméra, bannière nouveau jour, démarrage en pause) restent valables.
  3. Remplacer `apps/web/src/scene/` (PixiJS) par la scène Three.js. Pas de double moteur à la fin de la feature.
- ✅ **Ville et vie 3D** (`city-life.md`) : quartier complet autour de l'agence, voitures qui circulent sur les routes, cycle de lumière 09:00–21:00 avec ombres, éclairage du soir, circulation de fond — toutes les exigences de la section ⭐ non couvertes par `agency-view`.
- ✅ **Refonte de l'interface** (`ui-overhaul.md`) : les boutons, panneaux, HUD, tiroir et bannières datent de la version 2D et font tache à côté de la scène 3D. Les remplacer par une UI de tycoon mobile moderne : boutons avec relief, dégradés et état pressé animé, icônes dessinées (SVG) au lieu du texte seul, cartes de modèles avec vignette 3D de la voiture, HUD compact avec compteur de caisse animé, panneaux en verre dépoli/arrondis, micro-animations sur tout ce qui change, typographie affirmée. Tout via `tokens.css` (nouveaux tokens si besoin), cibles ≥ 44 px, safe areas, mouvement réduit respecté. Voir « UI au niveau » dans la section ⭐.

## Phase 1 — Les fondations du genre

1. ✅ **Sauvegarde automatique** (`autosave.md`) (`localStorage`, depuis `apps/web`) + `validateGameState` dans le sim, seed aléatoire par partie. Reprise au retour sur l'app. Indispensable : Safari iOS décharge souvent la PWA en arrière-plan.
2. ✅ **Demande client tirée au sort** (`random-demand.md`) (via `rng.ts`) : nombre de clients par jour, probabilité d'acceptation décroissante avec le prix. Remplace le seuil fixe `MAX_ACCEPTED_DAILY_PRICE` (aujourd'hui 150 € est toujours optimal : aucune vraie décision). Le badge « Au parking » dit pourquoi (« trop cher », « pas de client »).
3. ✅ **Gains hors ligne** (`offline-earnings.md`) : à la réouverture, écran « Pendant ton absence : +X € » avec bouton « Récupérer ». Plafond de durée (ex. 8 h), améliorable plus tard. Calcul via la sim pure (`advance`), simplifié si nécessaire pour rester rapide.

## Phase 2 — Priorités avant le rendu (dans cet ordre)

1. ✅ **Feedback de gain** : « +90 € » flottants au-dessus des voitures qui partent, compteur de caisse animé, pièces qui volent vers le HUD.
2. ✅ **Améliorations à coût croissant** (`upgrades.md`) (courbe exponentielle) : agrandir le parking (remplace le plafond fixe `MAX_FLEET_SIZE`), comptoir plus rapide, publicité (+ demande), station de lavage (+ prix accepté).
3. ✅ **Clients visibles** dans la vue 3D : petits personnages qui arrivent au comptoir, repartent avec une voiture ou repartent déçus (prix trop élevé).
4. ✅ **Niveau d'agence / XP** (`agency-level.md`) qui débloque de nouveaux modèles : SUV, utilitaire, électrique, cabriolet, luxe. Le catalogue s'ouvre progressivement.
5. ✅ **Tutoriel guidé** (`tutorial.md`) (première minute : acheter, tarifer, lancer le temps, lire le bilan), remplace le message d'accueil.
6. ✅ **Managers / employés** (`managers.md`) : commercial (+ demande), gérant (ajuste les prix). Automatisent les actions manuelles. (Le mécanicien attend « Revente + usure », reporté.)
7. ✅ **Récompense quotidienne** (`daily-reward.md`) (série de connexions).

## Prioritaire — Boutique

- ✅ **Boutique (argent réel, paiement crypto) — mode test** (`shop.md`) : diamants, pack de démarrage, boosters ; prestataire d'exemple NOWPayments via une fonction serverless (non déployée). Passage en réel : voir `docs/QUESTIONS.md`.

## Phase 3 — Rétention (dans cet ordre)

1. ✅ **Missions** (`missions.md`) : 3 objectifs actifs à la fois (« Possède 5 hybrides », « Gagne 10 000 € en un jour »…), récompense à chaque mission, remplacée par la suivante.
2. ⬜ **Événements** : vacances (demande ×2), salon de l'auto, grève, tempête. Bannière + effet temporaire.
3. ⬜ **Revente + usure** : valeur de revente décroissante avec l'âge, pannes aléatoires, entretien (+ mécanicien). Introduire `nextCarId` (ne jamais réutiliser un id).

## Plus tard (si le temps le permet)

- ⬜ **Sons et vibrations** (désactivables) : encaissement, achat, fin de journée. **Attend les fichiers audio** (packs Kenney Interface Sounds / Casino Audio / Music Jingles en `.mp3` dans `apps/web/public/assets/sounds/`). Vibrations : Android seulement (Safari iOS ne les permet pas).
- ⬜ **Nouvelles agences** (centre-ville, gare, aéroport) avec demande et clientèle différentes ; on bascule de l'une à l'autre.
- ⬜ **Crédit et faillite** : emprunt pour acheter au-delà de la caisse, game over après X jours de découvert.
- ⬜ **Statistiques** : historique des jours, graphique de la caisse, rentabilité par modèle.
- ⬜ **Prestige** : revendre l'entreprise contre un bonus permanent et recommencer plus vite.

## Règles pour l'agent lead

- Enchaîner les points de la phase en cours (Phase 3) dans l'ordre, en autonomie. Coder directement ; spec courte seulement pour les gros points.
- Décision de design ambiguë : prendre l'option la plus raisonnable pour un tycoon mobile et la noter dans `docs/QUESTIONS.md`, sans bloquer.
- Après chaque point : `npm run check` vert, commit, `git push`, cocher ici (⬜ → ✅). Une capture d'écran si le point est visuel.
- Notification (`PushNotification`, une ligne en français) seulement si : question vraiment bloquante, échec bloquant après plusieurs tentatives, ou point terminé et poussé.
- Le rendu doit rester au niveau de la section ⭐, sans en faire un préalable à chaque point.
- Les règles de `CLAUDE.md` priment toujours.
