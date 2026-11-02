# Design — TIFF structural analyzer

**Status:** ready for execution in Kiro; not executed.

## Module contract (follow `lib/filerec/media.ts` and `jpeg.ts`)

```ts
export function analyzeTiff(b: Uint8Array): AnalysisResult
export const tiffAnalyzer: Analyzer   // { id: 'tiff', label: 'TIFF', analyze }
```

Use the helpers in `lib/filerec/core.ts` (`damaged`, `matches`, `u16le`, `u32le`, `u16be`, `u32be`). Pick the 16/32-bit readers from the byte order once, e.g. `const r16 = le ? u16le : u16be`.

## Algorithm

1. Header check (R1). Read `ifdOffset`. If `ifdOffset < 8` or `>= b.length` → `danado` with `ifd_fuera_de_archivo` (the header is intact but nothing is reachable).
2. `seen = new Set<number>()`. Loop while `ifdOffset !== 0`: stop on `seen.has` (finding `ifd_ciclo`), on `seen.size >= 64` (`ifd_limite`), or if `ifdOffset + 2 > b.length`.
3. For each IFD: `n = r16(b, off)`; reject `n > 4096` (`ifd_limite`); require `off + 2 + n*12 + 4 <= b.length`, else record the damage from `off` to EOF and stop.
4. For each entry read `tag, type, count, valueOrOffset`. Compute the value size from `type` (1,2,6,7 → 1 B; 3,8 → 2 B; 4,9,11 → 4 B; 5,10,12 → 8 B). If `size*count > 4` the 4 bytes are an offset: verify it is inside the file, otherwise add `ifd_fuera_de_archivo` for that entry.
5. Collect tags 256, 257, 259, 273, 279 (first IFD only for the metadata item). Compute complete strips: `offsets[i] + counts[i] <= b.length`.
6. Integrity: `integro` if the whole chain was walked with no `dano` finding and every strip fits; `parcial` if the first IFD and dimensions are valid but strips are missing; `danado` if the first IFD is unreadable; `irrecuperable` if the header is invalid.
7. `limitations` always include the R6 statements. `meta`: `{ ancho, alto, compresion, ifds, tiras, tirasCompletas, orden }`.

## Test fixtures

Build fixtures in `tiff.test.ts` with small helper functions that write a header, one IFD and N strips of known bytes (no binary files in the repo). Truncate by slicing; corrupt offsets by overwriting 4 bytes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Infinite IFD chain | `seen` set + 64 IFD cap (R3) |
| Huge `count` causing memory use | Never allocate from `count`; only read, bounded by file size |
| Regressing the "recognised, not analysed" test | R7 explicitly migrates that test to WebP |
| i18n test fails on new strings | Add EN pairs in the same change (R8) |
