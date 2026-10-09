# Managers / employés

Statut : approuvé (révision 1). Roadmap : Phase 2, point 6.

## Règles

| Id        | Nom (UI)   | Embauche | Salaire/jour | Niveau | Effet                                                                 |
| --------- | ---------- | -------- | ------------ | ------ | --------------------------------------------------------------------- |
| `sales`   | Commercial | 8 000 €  | 80 €         | 2      | +15 points de demande (s'ajoute à la publicité)                       |
| `pricing` | Gérant     | 12 000 € | 120 €        | 3      | Chaque matin (minute 0), fixe le prix de chaque voiture à `bestPrice` |

- `bestPrice` : parmi 50 % à 200 % du prix de référence (lavage inclus), par pas de 5 %, arrondi à l'euro, le prix qui maximise prix × acceptation (comptoir inclus).
- Les salaires s'ajoutent aux charges de la fermeture (`lastDay.costs`).
- `hireManager` (paie l'embauche) / `fireManager` (sans remboursement). Erreurs : `UnknownManagerError`, `ManagerStateError` (déjà embauché / personne), `ModelLockedError` (niveau), `InsufficientCashError`.
- Sauvegarde : `GAME_STATE_VERSION = 5`, migration v4 → v5 : personne d'embauché.

## UI

Panneau « Employés » dans le tiroir, sous « Améliorations » : rôle, salaire, « Embaucher · coût » (ou « Niveau n requis »), « Licencier » une fois en poste.

## Historique des décisions

1. Le mécanicien attend « Revente + usure » (reporté, roadmap).
2. Avec un gérant, les prix saisis à la main sont écrasés le lendemain matin : c'est le rôle du poste ; le licencier rend la main.
