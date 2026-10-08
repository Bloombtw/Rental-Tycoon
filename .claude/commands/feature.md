---
description: Full multi-agent pipeline for a feature — spec, parallel build, break, review.
argument-hint: <feature description>
---

Build this feature with the agent team: **$ARGUMENTS**

1. **Spec**: launch `game-designer` to write `docs/specs/<slug>.md`. Read it and show me a 5-line summary. Show its open questions too. Wait for my OK before continuing; revise the spec only on my feedback, not on your own.
2. **Build in parallel**: following the spec's "Split" section, launch `sim-engineer`, `backend-engineer` and `frontend-engineer` **in the same message** for every part that doesn't depend on another. If the UI needs a sim API that doesn't exist yet, run `sim-engineer` first, then the others in parallel. Give each agent the spec path and the exact contract (exported types/functions, route shapes) it must respect.
3. **Integrate**: run `npm run check`. Route each failure to the agent that owns the file.
4. **Break**: launch `qa-breaker` on the feature. For each failing test it writes, send the fix to the owning agent. Loop until the tests pass.
5. **Review**: launch `reviewer`. Apply its **blocking** findings through the owners; list suggestions in the summary without acting on them.
6. Summarize what was built and what was tested, then propose a commit message. Don't commit without asking me.
