# Roadmap

Objectif : que Rental Tycoon ressemble à un **tycoon mobile moderne** de l'App Store (temps réel, retour visuel permanent, progression, objectifs, rétention).

Chaque point passe par `/feature <description>` : spec par `game-designer` dans `docs/specs/`, puis implémentation par les agents propriétaires, `qa-breaker`, `reviewer`. Un point = une spec = une PR. Respecter l'ordre : chaque phase s'appuie sur la précédente.

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
- Chaque feature visuelle se termine par des **captures d'écran** (`/shot`, iPhone 390 px portrait, à 09:00, 15:00 et 20:30) dans `screenshots/`. Le `reviewer` refuse un rendu « programmer art ».

## Phase 0 — Déjà fait

- ✅ Boucle de base : flotte, locations journalières, charges fixes (`core-loop.md`)
- ✅ Première partie jouable : achat, prix, HUD (`first-playable.md`)
- ✅ PWA installable sur iPhone, déployée sur GitHub Pages
- ✅ Journées 09:00–21:00, temps continu avec vitesses, vue de l'agence en 3D Three.js (`agency-view.md`) — fait avec le changement de moteur :
  1. Garder et terminer la partie **sim** (`time.ts`, journée d'ouverture, encaissement en direct) et la partie **horloge / vitesses / HUD** côté web : elles ne dépendent pas du moteur de rendu.
  2. Réviser la spec (`agency-view.md`, nouvelle révision) : la vue PixiJS 2D est remplacée par la **scène 3D Three.js** décrite ci-dessus ; les comportements de la spec (pastilles, sélection, gestes, caméra, bannière nouveau jour, démarrage en pause) restent valables.
  3. Remplacer `apps/web/src/scene/` (PixiJS) par la scène Three.js. Pas de double moteur à la fin de la feature.
- ⬜ **Ville et vie 3D** (juste après, avant la Phase 1) : quartier complet autour de l'agence, voitures qui circulent sur les routes, cycle de lumière 09:00–21:00 avec ombres, éclairage du soir, circulation de fond — toutes les exigences de la section ⭐ non couvertes par `agency-view`.

## Phase 1 — Les fondations du genre

1. ⬜ **Sauvegarde automatique** (`localStorage`, depuis `apps/web`) + `validateGameState` dans le sim, seed aléatoire par partie. Reprise au retour sur l'app. Indispensable : Safari iOS décharge souvent la PWA en arrière-plan.
2. ⬜ **Demande client tirée au sort** (via `rng.ts`) : nombre de clients par jour, probabilité d'acceptation décroissante avec le prix. Remplace le seuil fixe `MAX_ACCEPTED_DAILY_PRICE` (aujourd'hui 150 € est toujours optimal : aucune vraie décision). Le badge « Au parking » dit pourquoi (« trop cher », « pas de client »).
3. ⬜ **Gains hors ligne** : à la réouverture, écran « Pendant ton absence : +X € » avec bouton « Récupérer ». Plafond de durée (ex. 8 h), améliorable plus tard. Calcul via la sim pure (`advance`), simplifié si nécessaire pour rester rapide.

## Phase 2 — Retour visuel (« juice »)

4. ⬜ **Feedback de gain** : « +90 € » flottants au-dessus des voitures qui partent, compteur de caisse animé, pièces qui volent vers le HUD.
5. ⬜ **Clients visibles** dans la vue 3D : petits personnages qui arrivent au comptoir, repartent avec une voiture ou repartent déçus (prix trop élevé).
6. ⬜ **Sons et vibrations** (désactivables) : encaissement, achat, fin de journée.

## Phase 3 — Progression et objectifs

7. ⬜ **Améliorations à coût croissant** (courbe exponentielle) : agrandir le parking (remplace le plafond fixe `MAX_FLEET_SIZE`), comptoir plus rapide, publicité (+ demande), station de lavage (+ prix accepté).
8. ⬜ **Missions** : 3 objectifs actifs à la fois (« Possède 5 hybrides », « Gagne 10 000 € en un jour »…), récompense à chaque mission, remplacée par la suivante.
9. ⬜ **Niveau d'agence / XP** qui débloque de nouveaux modèles : SUV, utilitaire, électrique, cabriolet, luxe. Le catalogue s'ouvre progressivement.
10. ⬜ **Revente + usure** : valeur de revente décroissante avec l'âge, pannes aléatoires, entretien. Introduire `nextCarId` (ne jamais réutiliser un id).
11. ⬜ **Tutoriel guidé** (première minute : acheter, tarifer, lancer le temps, lire le bilan), remplace le message d'accueil.

## Phase 4 — Profondeur et rétention

12. ⬜ **Managers / employés** : mécanicien (répare automatiquement), commercial (+ demande), gérant (ajuste les prix). Automatisent les actions manuelles.
13. ⬜ **Nouvelles agences** (centre-ville, gare, aéroport) avec demande et clientèle différentes ; on bascule de l'une à l'autre.
14. ⬜ **Événements** : vacances (demande ×2), salon de l'auto, grève, tempête. Bannière + effet temporaire.
15. ⬜ **Crédit et faillite** : emprunt pour acheter au-delà de la caisse, game over après X jours de découvert.
16. ⬜ **Statistiques** : historique des jours, graphique de la caisse, rentabilité par modèle.
17. ⬜ **Récompense quotidienne** (série de connexions).
18. ⬜ **Prestige** : revendre l'entreprise contre un bonus permanent et recommencer plus vite. Mécanique de rétention long terme.

## Règles pour l'agent lead

- Travailler **en autonomie** : enchaîner les points dans l'ordre sans demander de validation entre deux features.
- Les décisions de design ambiguës : prendre l'option la plus raisonnable pour un tycoon mobile, la noter dans la section « Historique des décisions » de la spec, et lister les vraies questions dans `docs/QUESTIONS.md` au lieu de bloquer.
- Après chaque feature : `npm run check` vert, captures d'écran à jour, commit, `git push`, cocher le point ici (⬜ → ✅).
- **Notifications (outil `PushNotification`, arrive sur le téléphone du propriétaire via Remote Control)** — message d'une ligne, < 200 caractères, en français, qui commence par l'action attendue. Envoyer **uniquement** dans ces cas :
  1. **question vraiment bloquante** : impossible d'avancer sur aucun point de la roadmap sans la réponse (ex. « Question bloquante : retirer pixi.js du package.json ? Voir docs/QUESTIONS.md ») ;
  2. **échec qui bloque tout** : `npm run check` ou le déploiement en échec après plusieurs tentatives ;
  3. **feature terminée et poussée** : une notification courte (ex. « Feature Sauvegarde auto en ligne, à tester sur iPhone ») ;
  4. **roadmap entièrement terminée**.

  Jamais pour la progression de routine ni pour une question non bloquante (celle-ci va dans `docs/QUESTIONS.md` et le travail continue sur le point suivant).

- **Graphismes** : toute spec qui touche à l'affichage contient une section « Rendu » qui détaille les visuels selon la section « Priorité transversale » ci-dessus. Une feature au rendu simpliste n'est pas terminée.
- Les règles de `CLAUDE.md` priment toujours (sim pure, centimes, mobile first, 100 % navigateur).
