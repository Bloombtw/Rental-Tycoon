# Boutique (argent réel, paiement crypto) — mode test

Statut : approuvé (révision 1). Priorité demandée par le propriétaire, avant la Phase 3.

**Aucun argent réel tant que le propriétaire n'a pas de statut pour vendre (SIRET) ni de CGV.** Le jeu livré tourne en mode test : le paiement est simulé.

## Produits

Monnaie premium : les **diamants** (entier, `GameState.gems`).

| Id produit     | Contenu                           | Prix    | Achat unique |
| -------------- | --------------------------------- | ------- | ------------ |
| `gems_small`   | 100 diamants                      | 0,99 €  | non          |
| `gems_medium`  | 550 diamants                      | 4,99 €  | non          |
| `gems_large`   | 1 200 diamants                    | 9,99 €  | non          |
| `gems_huge`    | 2 600 diamants                    | 19,99 € | non          |
| `starter_pack` | 300 diamants + 25 000 € de caisse | 2,99 €  | oui          |

Boosters (payés en diamants, effet en **journées de jeu**, cumulable : prolonge la fin) :

| Id booster      | Effet                                  | Prix         |
| --------------- | -------------------------------------- | ------------ |
| `revenue_x2`    | Recettes de location ×2 pendant 1 jour | 60 diamants  |
| `revenue_x2_3d` | Recettes ×2 pendant 3 jours            | 150 diamants |
| `demand_plus`   | +50 points de demande pendant 1 jour   | 40 diamants  |
| `cash_bundle`   | +10 000 € de caisse immédiats          | 80 diamants  |

## Règles (sim, pures)

- `grantPurchase(state, receipt)` : crédite le produit d'un reçu ; **idempotent** (l'id de commande est mémorisé, `claimedOrders`, 200 derniers) ; refuse un produit inconnu, un achat unique déjà fait. Erreurs typées.
- `activateBooster(state, id)` : retire les diamants, `boosts.revenueUntilDay` / `boosts.demandUntilDay` = max(jour, fin actuelle) + durée ; `cash_bundle` crédite la caisse.
- Effets : pendant `day < revenueUntilDay`, chaque location encaisse 2× son prix (et compte 2× dans `todayRevenue`, l'XP reste au prix normal) ; pendant `day < demandUntilDay`, +50 points de demande.
- Sauvegarde : `GAME_STATE_VERSION` + 1, migration : 0 diamant, aucun booster, aucun achat.

## Paiement

- Interface web `PaymentProvider { pay(product): Promise<Receipt> }`.
- **Démo (défaut, sans `VITE_PAYMENTS_URL`)** : fenêtre « Paiement crypto — TEST » (choix BTC / ETH / USDC, montant indicatif), bouton « Simuler le paiement ». Produit un reçu `{ orderId, productId, mode: "test" }`. Un bandeau « Mode test : aucun paiement réel » est toujours visible dans la boutique.
- **NOWPayments (exemple de prestataire crypto, remplaçable)** via une fonction serverless (`apps/server/src/payments/`, API Web seulement, déployable en Cloudflare Worker) :
  1. `POST /checkout { productId }` → crée une facture NOWPayments (prix en EUR, payée en crypto) → `{ orderId, invoiceUrl }` ; le jeu ouvre `invoiceUrl`.
  2. `POST /ipn` : webhook NOWPayments, signature `x-nowpayments-sig` = HMAC-SHA512 (secret IPN) du JSON trié ; au statut `finished`, la commande est marquée payée.
  3. `GET /receipt/:orderId` → reçu signé Ed25519 `{ orderId, productId, mode: "live" }` + signature, si payé.
  4. Le jeu vérifie la signature avec la clé publique embarquée (`VITE_RECEIPT_PUBLIC_KEY`), puis `grantPurchase`.
- Limite assumée : un jeu solo dont la sauvegarde est locale reste modifiable par le joueur ; la signature empêche seulement les faux reçus.

## UI

- Diamants affichés dans le HUD (pastille) ; bouton « Boutique » (icône) qui ouvre la boutique plein écran : bandeau mode test, pack de démarrage mis en avant, packs de diamants (prix en €, « Payer en crypto »), boosters (prix en diamants, boosters actifs avec jours restants).
- Après un achat : message « +550 diamants » ; booster actif visible dans le HUD (« ×2 » avec jours restants).

## Avant de passer en réel (propriétaire)

SIRET / micro-entreprise, CGV + mentions légales, case « je renonce à mon droit de rétractation » avant paiement, compte NOWPayments (ou autre), déploiement du Worker et de ses secrets, clé publique de reçu dans le build.
