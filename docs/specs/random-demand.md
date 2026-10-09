# Demande client tirée au sort

Statut : approuvé (révision 1). Roadmap : Phase 1, point 2.

## But

Le seuil fixe `MAX_ACCEPTED_DAILY_PRICE` (150 €) rendait le prix maximal toujours optimal. La demande devient aléatoire (graine de la partie, `rng.ts`) et la probabilité de louer baisse avec le prix : fixer un prix devient une vraie décision.

## Règles (sim)

1. **Clients du jour.** À l'ouverture (traitement de la minute 0 de chaque jour), la sim tire `customersLeft = DEMAND_BASE + round(F × r)` avec `F` = taille de la flotte à l'ouverture et `r` uniforme dans `[DEMAND_MIN_PCT, DEMAND_MAX_PCT] / 100` (tirage entier en pour cent). Valeurs : `DEMAND_BASE = 1`, `DEMAND_MIN_PCT = 70`, `DEMAND_MAX_PCT = 115`.
2. **Créneau de départ.** Au créneau d'une voiture (inchangé : `index × 2` min) :
   - s'il ne reste aucun client : la voiture reste au parking, issue `noCustomer` ;
   - sinon un client se présente (`customersLeft − 1`) et accepte avec la probabilité `acceptanceChance(prix, prixDeRéférence)` : issue `rented` (encaissement comme avant) ou `tooExpensive`.
3. **Prix de référence** : `CAR_MODELS[model].defaultDailyPrice` (le « prix conseillé ») ; voiture sans modèle (fixtures) : `FIXTURE_REFERENCE_PRICE = 90 €`.
4. **Courbe d'acceptation** (linéaire par morceaux sur `x = prix / référence`) : `x ≤ 0,5 → 98 %`, `x = 1 → 85 %`, `x = 1,5 → 40 %`, `x ≥ 2 → 0 %`. Prix 0 : 98 %.
5. **Déterminisme.** Tous les tirages passent par `rng.ts` à partir de `rngState`, qui est mis à jour dans l'état. Même état + mêmes minutes → même résultat, y compris découpé en plusieurs appels.
6. **État.** `GameState.customersLeft: number` (entier ≥ 0) ; `Car.outcome?: "rented" | "tooExpensive" | "noCustomer"` (absent tant que la voiture n'a pas eu de créneau). `rented` reste la source de vérité de l'affichage 3D.
7. **Sauvegarde.** `GAME_STATE_VERSION = 2`. Migration v1 → v2 : `customersLeft = taille de la flotte`, `outcome` absent.

## UI

- Badge de la voiture au parking : « Au parking · trop cher » (`tooExpensive`), « Au parking · pas de client » (`noCustomer`), « Au parking » sinon. Même texte dans l'infobulle 3D.
- Carte d'achat : « Prix conseillé » inchangé (c'est le prix de référence).

## Critères d'acceptation

1. Plus aucune référence à `MAX_ACCEPTED_DAILY_PRICE`.
2. À prix conseillé, sur 200 jours et 20 voitures, le taux de location est entre 70 % et 90 %.
3. Au double du prix conseillé, aucune location.
4. Deux exécutions avec la même graine donnent le même état ; `advanceMinutes(s, 720)` = 720 appels d'une minute.
5. Une sauvegarde v1 se recharge (migration) ; un `customersLeft` invalide est rejeté.
6. Le badge affiche la raison ; jamais `undefined`.

## Historique des décisions

1. Demande proportionnelle à la flotte (70–115 % + 1) en attendant les améliorations « publicité » (Phase 3) qui la feront monter.
2. Un client qui refuse est perdu pour la journée : un prix trop élevé coûte des clients.
