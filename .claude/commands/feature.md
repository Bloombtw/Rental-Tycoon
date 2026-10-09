---
description: Build a feature fast — short spec if needed, build, check, commit proposal.
argument-hint: <feature description>
---

Build this feature: **$ARGUMENTS**

1. **Plan**: if the feature is small, just do it. If it's big or touches the economy, write a short spec in `docs/specs/<slug>.md` yourself (or with `game-designer`), show me a 5-line summary and go on unless something is really undecided.
2. **Build**: write the code directly, or delegate to `sim-engineer` / `frontend-engineer` / `backend-engineer` in parallel when the parts are independent and big enough to be worth it. Give each one the exact contract (types, functions, routes).
3. **Check**: run `npm run check` and fix what fails.
4. Summarize what was built and propose a commit message. Don't commit without asking me.

Only run `qa-breaker` (`/break`) or `reviewer` (`/review`) if I ask for it.
