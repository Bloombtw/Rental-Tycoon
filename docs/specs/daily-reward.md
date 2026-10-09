# Récompense quotidienne

Statut : approuvé (révision 1). Roadmap : Phase 2, point 7.

## Règles

- Une prime par jour calendaire local. Le web calcule le numéro du jour (`calendarDay`, jours depuis 1970 dans le fuseau du joueur) ; la sim ne lit jamais d'horloge.
- Série : jour suivant le dernier encaissement → série + 1 ; jour manqué → série 1. Primes du cycle de 7 jours : 500, 750, 1 000, 1 500, 2 000, 3 000, 5 000 € (le 8ᵉ jour recommence à 500 €).
- `claimDailyReward(state, today)` ; refus typé `RewardAlreadyClaimedError` (déjà encaissée ou jour invalide).
- État : `dailyReward { lastDay, streak }` ; `GAME_STATE_VERSION = 6`, migration v5 → v6 : jamais encaissée.

## UI

- Fenêtre « Récompense du jour » au lancement et au retour d'arrière-plan si une prime est disponible, une fois le tutoriel terminé et l'écran « Pendant ton absence » fermé : frise des 7 jours (passés grisés, aujourd'hui en or), montant, « Récupérer ».

## Historique des décisions

1. Montants fixes (pas indexés sur la progression) : simple et lisible pour une première version.
2. Changer l'heure de l'appareil permet de tricher ; accepté (jeu solo, sans classement dépendant de la caisse).
