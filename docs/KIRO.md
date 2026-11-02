# How Kiro was used — evidence statement

This page states only what the repository can prove. It deliberately does **not** claim Kiro usage that is not evidenced.

## What exists in `/.kiro` (repository root, tracked, not git-ignored)

| File | What it is | Date (file) |
|---|---|---|
| `.kiro/steering/product.md` | Steering principles: separate recovered / inferred / verified / unknown evidence; no invented metrics; never execute uploaded files; limit resources | 2026-10-30 |
| `.kiro/specs/dbf-archaeology/{requirements,design,tasks}.md` | Spec (requirements → design → tasks) for the DBF archaeology engine | 2026-10-30 |
| `.kiro/specs/inventory-reconstruction/{requirements,design}.md` | Spec for inventory reconstruction (no `tasks.md`) | 2026-10-31 |
| `.kiro/README.md` | States that this structure *prepares* work for Kiro and "does not constitute evidence of execution" | 2026-10-30 |

**Hooks: none.** There is no `.kiro/hooks/` directory.
**MCP configuration: none** in the repository.

## What the repository does NOT prove

- It contains **no log, screenshot, session export or Kiro version number** showing that Kiro executed any spec or task.
- The `tasks.md` of `dbf-archaeology` has its 4 checkbox items unticked.
- The commit history does not mark which changes (if any) were produced inside Kiro.

Therefore this project **does not state** that Kiro generated the specs or the code. The steering rules *are* applied in the implementation (they match the product's "honesty contract": the `verified` flag, no invented data, programs are never executed) and are enforced by tests, but that is an alignment, not proof of Kiro execution.

## How the code was actually written

The competition-edition engine, Resurrection Lab, GIF/BMP/WAV analyzers, accessibility fixes and documentation were written in sessions with **Claude Code** (Anthropic's coding agent) under the author's direction. Every change is in `git log` with its tests. This is stated here so that no one infers Kiro authorship.

## Pending for the author (cannot be written by the repository)

The official 2025 rules, carried over by third-party summaries (the 2026 rules page was not retrievable by us — see `docs/RELEASE-CANDIDATE.md`), asked entrants to explain how Kiro was used (vibe coding, agent hooks, specs, steering, MCP) and to include `/.kiro` with specs, hooks and steering. If the author uses Kiro for any real work before submitting, record here — with true dates:

1. Kiro version and date of each session.
2. Which spec (requirements → design → tasks) was executed in Kiro, and the commit(s) that resulted.
3. Any hook actually configured and what it ran (for example, `npm test` on save under `lib/filerec/`) — add the file under `.kiro/hooks/` **only after** it has been created and exercised inside Kiro.
4. Screenshots or an exported session as evidence.

Until then, the honest description is: *"The repository contains Kiro steering and two Kiro-format specs prepared in Kiro's structure; implementation was done with Claude Code; no Kiro hooks were used."*
