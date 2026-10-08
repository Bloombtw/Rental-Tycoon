---
description: Run the full safety net (format, lint, types, tests) and fix what fails.
---

Run `npm run check`. If something fails, group the failures by owner (sim / server / web / harness) and dispatch each group to its agent in parallel. Re-run until it's green, then report.
