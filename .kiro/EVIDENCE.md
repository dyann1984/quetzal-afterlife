# Kiro usage evidence log

**Current state: EMPTY. No Kiro execution has been recorded.** The rest of this file is a template for the author to fill in with real data after running `.kiro/specs/tiff-structural-analyzer` in Kiro. Do not fill it from memory or with estimates, and do not describe work done by other tools as Kiro's.

| Field | Value (fill with real data) |
|---|---|
| Kiro version (Help → About) | |
| Date/time of session (with time zone) | |
| Model selected in Kiro | |
| Spec executed | tiff-structural-analyzer |
| Tasks Kiro completed (ticked by Kiro in `tasks.md`) | |
| Commits produced from Kiro (hash + `kiro:` prefix) | |
| Hook created in Kiro (path + trigger + what it ran) | |
| Evidence of a hook trigger (screenshot path / transcript) | |
| Session export or screenshots (paths under `docs/kiro-evidence/`) | |
| `npm test` before → after (counts) | 345 → |
| `npm run typecheck` / `lint` / `build` | |
| Anything Kiro got wrong or that needed manual correction | |

## Verification a judge can do without trusting this file

1. `git log --grep="^kiro:"` lists the commits made from Kiro.
2. `git diff <base>..<commit> --stat` must match the file list in the spec's acceptance criteria.
3. `.kiro/specs/tiff-structural-analyzer/tasks.md` shows boxes ticked in that commit's diff.
4. `npm test` reproduces the count recorded above.
