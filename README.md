# Rental Tycoon

Tycoon en vue de dessus : gère ton agence de location de voitures.

**Jouer en ligne :** https://bloombtw.github.io/Rental-Tycoon/

## Installer sur iPhone

1. Ouvre le lien ci-dessus dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. Le jeu s'ouvre en plein écran depuis son icône et fonctionne hors ligne.

(Sur Android/Chrome : menu ⋮ → **Installer l'application**.)

## Lancer

```bash
npm install
npm run dev        # serveur :3001 + jeu sur http://localhost:5173
```

Node 24.15+ requis (`nvm use` lit `.nvmrc`).

## Vérifier

```bash
npm run check      # format + lint + types + tests (identique à la CI)
```

## Harness Claude Code

Le jeu est construit par une équipe d'agents Claude Code. Voir `CLAUDE.md` et `.claude/`.

| Agent                     | Rôle                                   | Peut écrire dans    |
| ------------------------- | -------------------------------------- | ------------------- |
| lead (session principale) | découpe, orchestre, intègre            | — (délègue)         |
| `game-designer`           | specs et équilibrage                   | `docs/`             |
| `sim-engineer`            | règles du jeu, simulation pure         | `packages/sim/`     |
| `backend-engineer`        | API, auth, sauvegardes                 | `apps/server/`      |
| `frontend-engineer`       | UI React + rendu PixiJS                | `apps/web/`         |
| `qa-breaker`              | essaie de tout casser, écrit des tests | `*.test.ts`, `e2e/` |
| `reviewer`                | revue avant merge                      | lecture seule       |

Captures d'écran : `screenshots/`.
