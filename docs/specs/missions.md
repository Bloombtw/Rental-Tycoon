# Missions

Statut : approuvé (révision 1). Roadmap : Phase 3, point 1.

## Règles (sim)

- Chaîne fixe de 24 missions de difficulté croissante (`MISSIONS`), 3 actives à la fois (`missions.slots`, `missions.next`).
- Objectifs : posséder N voitures, posséder N voitures d'un modèle, encaisser X € en une journée (bilan d'hier), avoir X € en caisse, atteindre un niveau d'agence, monter une amélioration à un niveau, embaucher un employé.
- `claimMission(state, slot)` : si la mission du créneau est accomplie, verse la prime (de 1 000 € à 40 000 €) et la remplace par la suivante de la chaîne ; créneau vide à la fin de la chaîne. Sinon `MissionNotReadyError`.
- Sauvegarde : `GAME_STATE_VERSION = 8`, migration v7 → v8 : début de la chaîne.

## UI

- Panneau « Missions » en haut du tiroir (après le tutoriel) : intitulé, prime, barre de progression et « x / y » ; une mission accomplie affiche « Récupérer +X € ».
- Badge rouge sur la poignée du tiroir : nombre de récompenses à récupérer.

## Historique des décisions

1. Récompense réclamée par le joueur (bouton) plutôt que versée automatiquement : geste gratifiant, et la caisse ne change jamais sans action visible.
2. Chaîne fixe plutôt qu'aléatoire : progression lisible, équilibrage simple ; elle se termine par « Toutes les missions sont accomplies ».
