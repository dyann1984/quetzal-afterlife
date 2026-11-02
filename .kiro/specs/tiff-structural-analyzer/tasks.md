# Tasks — TIFF structural analyzer

**Status: NOT STARTED.** Kiro must tick each box itself (in the Kiro tasks view) as it executes the task; do not tick boxes by hand. Commit from the Kiro session with the message prefix `kiro:` so the history shows the origin.

- [ ] 1. Create `lib/filerec/tiff.ts` with `analyzeTiff` implementing R1–R6 (see design.md) and a failing-first `lib/filerec/tiff.test.ts`.
- [ ] 2. Make the tests pass (≥ 12 tests, see acceptance criteria).
- [ ] 3. Register the analyzer: `identify.ts` (`tiff-le`, `tiff-be` → `'tiff'`), `index.ts` (`ANALYZERS.tiff`).
- [ ] 4. Update `filerec.test.ts`: the "recognised without analyzer" test now uses a WebP header.
- [ ] 5. Add explanation entries (`explain.ts`) and English pairs (`msgs-filerec.ts`) for every new message; update `lib/capabilities.ts` (TIFF `parcial`, honest limits).
- [ ] 6. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; paste the real output summary into `.kiro/EVIDENCE.md`.
- [ ] 7. **Create a Kiro hook** in Kiro's *Agent Hooks* panel: on save of `lib/filerec/**/*.ts`, run `npm test` (or the agent prompt "run the filerec tests and report failures"). Commit the generated file under `.kiro/hooks/` **only if Kiro generated it**, and record in EVIDENCE.md one real trigger (save → result).
- [ ] 8. Fill `.kiro/EVIDENCE.md` completely (version, dates, session export or screenshots, commit hashes, results) and update `docs/KIRO.md` from "pending" to the true statement.
