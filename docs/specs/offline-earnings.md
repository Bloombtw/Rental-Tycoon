# Gains hors ligne

Statut : approuvé (révision 1). Roadmap : Phase 1, point 3.

## Règles

1. Une absence (app fermée, ou page en arrière-plan) fait tourner l'agence au rythme d'**une journée de jeu toutes les 10 minutes réelles** (`OFFLINE_DAY_MS`), plafonné à **8 h** (`MAX_OFFLINE_MS`), soit 48 journées au plus.
2. Le calcul utilise la sim pure : `advance(game, jours)` (chaque jour termine la journée en cours puis rouvre à 09:00). Les clients sont tirés comme en jeu (graine), donc le résultat peut être négatif.
3. Au lancement : temps écoulé = maintenant − `savedAt` de la sauvegarde. Au retour d'arrière-plan : temps écoulé depuis le masquage. Un `savedAt` dans le futur, invalide ou une absence de moins de 10 min ne donne rien.
4. Les gains sont **appliqués tout de suite** à la partie (rien n'est perdu si l'app se ferme avant le clic), le jeu reste en pause, puis l'écran « Pendant ton absence » montre le montant (« +X € » ou « −X € ») et le nombre de journées. Bouton « Récupérer » (gain) ou « Continuer » (perte) : ferme l'écran.
5. Deux absences avant le clic s'additionnent dans le même écran.

## Historique des décisions

1. 10 min réelles par journée : 8 h d'absence ≈ 48 jours, assez pour sentir la progression sans remplacer le jeu actif (une journée dure ~29 s à x1).
2. Gains appliqués avant le clic plutôt qu'au clic : une sauvegarde forcée (page masquée) ne peut pas les perdre.
3. Les améliorations « plafond hors ligne » viendront avec la Phase 3.
