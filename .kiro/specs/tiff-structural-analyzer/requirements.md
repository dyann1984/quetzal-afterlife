# Requirements — TIFF structural analyzer

**Spec:** tiff-structural-analyzer
**Status:** READY FOR EXECUTION IN KIRO — **NOT YET EXECUTED.** This file was written by Claude Code on 2026-11-02 so that Kiro can implement it. Nothing here claims that Kiro has run it. Record the real run in `.kiro/EVIDENCE.md`.

## Why this task

TIFF is currently "recognised by signature, not analysed" (`lib/filerec/identify.ts`, capability `imagenes-otras`). TIFF is also the container of legacy scanner/fax/archive images, which fits the *Resurrection* theme. This spec upgrades TIFF from signature-only to **structural diagnosis**, using the same honesty contract as the other analyzers. It is deliberately small, isolated (one new file, no UI) and fully testable, so its result can be verified from `git diff` and `npm test` alone.

## Scope

Add `lib/filerec/tiff.ts` exporting `analyzeTiff(bytes): AnalysisResult` and `tiffAnalyzer: Analyzer`, register it, and cover it with tests. **No pixel decoding. No repair** (diagnosis only).

## Requirements (EARS)

1. **R1 — Header.** WHEN the input starts with `49 49 2A 00` (little-endian) or `4D 4D 00 2A` (big-endian), the analyzer SHALL read the byte order and the offset of the first IFD; otherwise it SHALL return `integrity: 'irrecuperable'` with finding `firma_invalida`.
2. **R2 — IFD walk.** The analyzer SHALL walk the chain of IFDs, reading for each the entry count (2 bytes), the entries (12 bytes each) and the next-IFD offset (4 bytes). IF an offset or entry falls outside the file, THEN it SHALL add a `dano` finding (`ifd_fuera_de_archivo`) with the byte offset and a `DamagedRange`.
3. **R3 — Loop and size guards.** The analyzer SHALL stop after 64 IFDs, 4096 entries per IFD, or on a repeated IFD offset, adding finding `ifd_ciclo` or `ifd_limite`. It SHALL never throw on malformed input.
4. **R4 — Tags.** The analyzer SHALL read `ImageWidth` (256), `ImageLength` (257), `Compression` (259), `StripOffsets` (273) and `StripByteCounts` (279) when present, and report width × height and compression as a `metadatos` item with `verified: true` only if the IFD that contains them is fully inside the file.
5. **R5 — Truncation.** WHEN every strip declared by `StripOffsets` + `StripByteCounts` fits inside the file the analyzer SHALL report `integro`; WHEN some strips are missing it SHALL report `parcial`, the number of complete strips, and a `DamagedRange` for the missing bytes (finding `strips_ausentes`).
6. **R6 — Honesty.** The analyzer SHALL NOT mark any pixel data `verified` (there is no checksum) and SHALL state in `limitations` that pixels are not decoded and no repair is attempted.
7. **R7 — Integration.** `identify.ts` SHALL route `tiff-le` and `tiff-be` to the new analyzer; `ANALYZERS` SHALL include it; the capability matrix SHALL list TIFF as `parcial` with accurate `soporta` / `limitaciones` text; the existing test "formatos reconocidos sin analizador" that uses a TIFF header SHALL be changed to another still-unanalysed format (for example WebP) with a one-line justification in the commit message.
8. **R8 — i18n.** Every new user-visible message SHALL have an English pair in `lib/i18n/msgs-filerec.ts` (enforced by `lib/i18n/i18n.test.ts`) and explanation entries in `lib/filerec/explain.ts` for the new finding codes.

## Acceptance criteria (objective, checkable by anyone)

- `npm test` passes; the test count increases by **at least 12** over the 345 on the base commit, all in `lib/filerec/tiff.test.ts`, covering: little- and big-endian valid files, truncated strips, IFD offset beyond EOF, IFD loop, > 64 IFDs, zero-byte and 3-byte inputs, a non-TIFF `II` file, and `analyzeFile` integration (format `tiff-le` → `integro`).
- `npm run typecheck` and `npm run lint` report 0 errors and 0 warnings.
- `npm run build` succeeds.
- `git diff --stat` touches only: `lib/filerec/tiff.ts`, `lib/filerec/tiff.test.ts`, `lib/filerec/identify.ts`, `lib/filerec/index.ts`, `lib/filerec/filerec.test.ts` (R7 change), `lib/filerec/explain.ts`, `lib/capabilities.ts`, `lib/i18n/msgs-filerec.ts`, `.kiro/specs/tiff-structural-analyzer/tasks.md`, `.kiro/EVIDENCE.md`.
- No existing test is deleted or weakened apart from the single R7 change.

## Out of scope

LZW/Deflate/JPEG-in-TIFF decoding, BigTIFF, tiled layouts, any UI change, any change to the Resurrection Lab.
