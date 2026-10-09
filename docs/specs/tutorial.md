# Tutoriel guidé

Statut : approuvé (révision 1). Roadmap : Phase 2, point 5.

## Règles

- Démarre seulement pour une agence neuve (jour 0, 09:00, flotte vide), et à chaque « Nouvelle partie ».
- Étapes (`UiState.tutorial`) : `buy` → `price` → `run` → `wait` → `report` → `done`.
  1. **Acheter** : passe à l'étape suivante dès qu'une voiture est achetée.
  2. **Prix** : après un prix accepté, ou « Garder ce prix ».
  3. **Lancer le temps** : dès que le temps tourne.
  4. **Attendre** : jusqu'à la première fermeture (changement de jour).
  5. **Bilan** : « Compris » termine.
- « Passer le tutoriel » à tout moment. Une action refusée ne fait pas avancer.
- Le tutoriel n'est pas sauvegardé : recharger en cours de route le termine si la partie n'est plus neuve.

## UI

- Carte de coach (« Tutoriel · n/5 », titre, texte, bouton éventuel, « Passer le tutoriel ») : en haut du tiroir pour les étapes 1–2 (le tiroir s'ouvre), sous le HUD ensuite (le tiroir se ferme à l'étape 3).
- L'élément concerné pulse (halo en opacité seulement) : bouton « Acheter » de la citadine d'occasion, éditeur de prix, bilan du HUD ; « Reprendre » a déjà son halo.
- Les messages de succès restent affichés.
