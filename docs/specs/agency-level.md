# Niveau d'agence / XP

Statut : approuvé (révision 1). Roadmap : Phase 2, point 4.

## Règles

- **XP** : 1 XP par euro encaissé en location (`rentalXp`), cumulé dans `GameState.xp`. Niveau = `levelForXp(xp)`, seuils `LEVEL_XP` = 0, 1 500, 4 000, 9 000, 18 000, 35 000, 60 000, 100 000, 160 000, 250 000 (niveaux 1 à 10).
- **Catalogue** (achat, coût/jour, prix conseillé, niveau) :
  - Citadine d'occasion 4 000 € / 60 € / 90 € — niv. 1 ; Citadine neuve 9 000 / 25 / 60 — 1 ; Berline hybride 16 000 / 10 / 120 — 1
  - SUV familial 22 000 / 30 / 150 — 2 ; Utilitaire 18 000 / 35 / 140 — 3 ; Citadine électrique 28 000 / 8 / 160 — 4 ; Coupé sport 45 000 / 50 / 260 — 5 ; SUV de luxe 70 000 / 60 / 380 — 6
- `buyCar` refuse un modèle verrouillé : `ModelLockedError(model, niveauRequis)`.
- Sauvegarde : `GAME_STATE_VERSION = 4`, migration v3 → v4 : `xp = 0`.

## UI

- Pastille de niveau dorée à côté de l'horloge du HUD (petite animation au passage de niveau).
- Panneau d'achat : « Niveau n · x / y XP » avec barre, « Prochain modèle au niveau n+1 : … » ; modèles débloqués + le prochain verrouillé (grisé, « Débloqué au niveau n »).
- Passage de niveau : message « Niveau n atteint ! Nouveau modèle : … ».

## Historique des décisions

1. Pas de cabriolet dans le kit Kenney : « Coupé sport » (`race.glb`) à la place. Électrique = `race-future.glb`, Utilitaire = `delivery-flat.glb`, SUV de luxe = `suv-luxury.glb`.
2. Le SUV familial partage le modèle `suv` de la circulation de fond : nos voitures restent reconnaissables (teintes, pastilles « louée »). Les trois modèles de départ restent exclusifs.
3. Pas de prime en argent au passage de niveau : la caisse ne bouge qu'avec les locations, les charges et les achats.
