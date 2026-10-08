# Rental Tycoon

Top-down tycoon game (flat modern style) where the player runs a car rental agency: buy a fleet, set prices, serve customers, maintain cars, expand, survive events.

## Stack and layout (npm workspaces)

| Path                                        | What                                                       | Owner agent         |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| `packages/sim`                              | Pure, deterministic game simulation (TS)                   | `sim-engineer`      |
| `apps/server`                               | Fastify API, auth, saves, leaderboard (`node:sqlite`, zod) | `backend-engineer`  |
| `apps/web`                                  | Vite + React (HUD/menus) + PixiJS v8 (city view)           | `frontend-engineer` |
| `docs/specs`                                | Feature specs                                              | `game-designer`     |
| `**/*.test.ts`, `e2e/`                      | Adversarial tests                                          | `qa-breaker`        |
| `.claude/`, `.github/`, `.husky/`, lockfile | Harness: humans only                                       | —                   |

Dependency direction: `web → sim`, `server → sim`. `sim` imports nothing from the apps.

## How we work (the lead = main session)

- The main session orchestrates; it delegates code to the owner agents instead of writing it itself. Use `/feature` for anything non-trivial.
- No code without a spec in `docs/specs/` first.
- Launch independent agents **in parallel in one message**. Hand each one the spec path and the exact contract (types, function signatures, routes) so parallel work fits together.
- Agents write only inside their scope (enforced by hooks). Never use Bash to work around it (no `sed -i`, `echo >` or file moves outside your scope). Report cross-scope needs to the lead.
- A feature is done only when `npm run check` is green, `qa-breaker` has attacked it and `reviewer` approved.

## Rules that are always true

- **Money = integer cents** (`Cents` type). Never floats for money.
- **Sim is pure**: no `Math.random` (seeded `rng.ts`), no `Date.now`, no I/O. Enforced by ESLint.
- **Never trust input**: zod on every server route, constrained inputs + re-validation in the UI, typed errors in sim. Nothing may render `NaN`, `undefined` or crash to a blank screen.
- **Design tokens** from `apps/web/src/styles/tokens.css`; no raw hex in components.
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`, no `@ts-ignore`.
- UI text in French; code, identifiers and comments in English.

## Commands

- `npm run dev`: server :3001 + web :5173
- `npm run check`: format, lint, typecheck, tests (same as CI)
- `npx vitest run --project sim|server|web`: one package's tests

## Safety net (automatic)

- PostToolUse hook: prettier + eslint --fix on every edited file; leftover lint errors are fed back to the agent.
- Stop hook: typecheck + tests must pass before the lead finishes a turn.
- Pre-commit (husky + lint-staged), and GitHub Actions CI runs `npm run check` + build.
