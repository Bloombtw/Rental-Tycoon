# Améliorations à coût croissant

Statut : approuvé (révision 1). Roadmap : Phase 2, point 2.

## Règles (sim)

Quatre améliorations, chacune avec un niveau entier (départ 0) et un coût qui croît exponentiellement : `coût(n) = arrondi_100€(base × (croissance/100)^n)`, calculé en centimes entiers pas à pas.

| Id        | Nom (UI)            | Niveau max | Base    | Croissance | Effet par niveau                                                 |
| --------- | ------------------- | ---------- | ------- | ---------- | ---------------------------------------------------------------- |
| `parking` | Agrandir le parking | 9          | 2 000 € | 160 %      | +5 places (capacité = 5 + 5 × niveau, max 50 = `MAX_FLEET_SIZE`) |
| `counter` | Comptoir rapide     | 5          | 3 000 € | 180 %      | Acceptation × (1 + 5 %) par niveau, plafonnée à 99 %             |
| `ads`     | Publicité           | 5          | 2 500 € | 170 %      | Demande +10 points de pourcentage (min et max)                   |
| `wash`    | Station de lavage   | 5          | 5 000 € | 190 %      | Prix de référence + 10 % (les clients acceptent plus cher)       |

- `buyUpgrade(state, id)` : retire le coût de la caisse, niveau + 1. Erreurs typées : `UnknownUpgradeError`, `UpgradeMaxedError`, `InsufficientCashError`.
- `buyCar` refuse au-delà de la capacité du parking : `FleetFullError(capacité)`.
- Au-delà de 2× le prix de référence (après lavage), la location reste impossible même avec le comptoir.
- `createGame` : le niveau de parking initial couvre la flotte de départ (fixtures).
- Sauvegarde : `GAME_STATE_VERSION = 3`, champ `upgrades`. Migration v2 → v3 : parking au niveau qui couvre la flotte, le reste à 0.

## UI

- Panneau « Améliorations » dans le tiroir, sous « Acheter une voiture » : une carte par amélioration (icône, nom, « Niv. n/max », effet actuel → suivant, bouton « Améliorer · coût », désactivé si caisse insuffisante ; « Niveau max » au maximum).
- La poignée du tiroir affiche « Flotte n/capacité ». Le panneau d'achat dit « Parking plein (n/capacité) : agrandissez le parking ».

## Historique des décisions

1. Le comptoir agit sur l'acceptation (le service est plus agréable) : la sim n'a pas de file d'attente à accélérer.
2. Capacité de départ 5 places : la première amélioration arrive vite et donne un objectif clair.
