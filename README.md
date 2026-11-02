# QUETZAL AFTERLIFE
### The Digital Resurrection Engine

Production: https://quetzal-afterlife.vercel.app (**as of 2026-11-02 it still serves an earlier build without Resurrection Lab / TRY QUETZAL NOW**; it must be redeployed from this release candidate — see [docs/RELEASE-CANDIDATE.md](docs/RELEASE-CANDIDATE.md)) · Spanish README: [README.es.md](README.es.md) · **Judges: [docs/JUDGES.md](docs/JUDGES.md)**

QUETZAL recovers what is **verifiably** recoverable from damaged digital files and tells you plainly what is not. Everything runs in the browser: files are never uploaded.

> **Honesty contract.** An item is marked *verified* only when an objective check backs it (CRC-32, Adler-32, SHA-256, re-analysis of the repair). Overwritten or missing data is reported as lost, never invented. Nothing here claims universal recovery.

## Problem → solution

**Problem.** A broken CRC, an erased signature, a cut-off download or a few zeroed sectors usually get one answer from common tools: "corrupt file". Cloud recoverers want your sensitive data; desktop tools say "recovered" without saying how.

**Solution.** QUETZAL identifies the format by signature or structure, locates the damage to the exact byte range, repairs only what can be proven, re-analyses its own repair, and reports what was lost. It runs entirely client-side, with its own Inflate/Deflate, CRC-32 and Adler-32 implementations.

**What makes it different.** Every recovered element carries a `verified` flag backed by a concrete check; a built-in negative control (an unrecoverable file) proves it does not fabricate data; and the Lab compares each result with a reference original so anyone can check the verdict.

## Try it in 30 seconds

1. Open the app and press **TRY QUETZAL NOW** (Dashboard) → **Resurrection Lab**.
2. Pick one of nine damaged files, press **Run analysis** (or **Run all 9 examples**).
3. Watch the real engine run, compare before/after, check the SHA-256 against the original, and download the recovered file and the technical report.

Prefer a guided tour? Press **▶ Guided demo · 3 min** on the Dashboard. Steps 4–7 execute the real engine; nothing is pre-recorded.

## Resurrection Lab: the nine examples

Every example is generated deterministically by code (original + damaged file), so results are reproducible and the verdict is checked against the original.

| # | Case | What happens | Expected outcome |
|---|---|---|---|
| 1 | PNG with altered CRC-32 fields | Pixels are intact (Adler-32 verifies); only control fields are broken | Full recovery, **byte-identical** to the original (SHA-256 match) |
| 2 | Partially corrupted UTF-8 text | Zeroed bytes, garbage, a split character in 4 of 13 lines | Partial: 9 intact lines recovered identically; losses marked with `�` |
| 3 | DOCX with altered `PK` signatures | Identified through the central directory; Deflate entries verify CRC-32 | Full recovery, byte-identical |
| 4 | ZIP with one damaged Deflate stream | 2 of 3 entries verify; the damaged one yields only a readable prefix | Partial; prefix labelled **NOT verified** |
| 5 | PNG overwritten with random data | No header, no image data, entropy ≈ 8 bits/byte | **Unrecoverable**: no repaired file is offered |
| 6 | PNG truncated at 60 % | Rows from complete, CRC-valid IDAT chunks are decoded | Partial: recovered rows identical to the original's |
| 7 | Animated GIF cut mid-frame | 2 of 4 frames are complete; the trailer is missing | Partial: the 2 complete frames kept byte-identical + trailer; the browser's own decoder reads exactly 2 frames. Pixels **not verified** (no LZW decoding) |
| 8 | BMP truncated (60 of 96 rows) | Header declares more rows than the file holds | Partial: rows present identical; missing rows are **zero filler**, labelled as such |
| 9 | WAV cut at 55 % mid-sample | RIFF/data sizes no longer match the file | Partial: trimmed to whole samples, sizes corrected; browser decodes 0.825 s of 1.5 s. Samples **not verified** (PCM has no checksum) |

Examples 7–9 have confidence **LOW** by design: their content has no checksum, so the engine never claims verification.

The "explanation" panel is produced by deterministic rules from the technical report. **It is not generative AI** and calls no external service.

## Supported formats (what is real today)

| Format | Identification | Integrity checks | Repair / recovery | Documented limits |
|---|---|---|---|---|
| PNG | signature, or IHDR position if the signature is damaged | CRC-32 per chunk, IHDR, own Inflate + Adler-32, filter bytes | restores CRC fields, signature and IEND when data verifies; recovers the intact row prefix after truncation/corruption | Adam7 interlaced not decoded; image is not rendered by the engine |
| JPEG | signature | marker structure, segment lengths, EOI | appends EOI to truncated files | **no pixel decoding**; recovered pixels are not verified |
| PDF | `%PDF-` within 1 KiB | xref/startxref, object boundaries, Flate Adler-32 | rebuilds xref, extracts text (Tj/TJ) from intact streams | no ObjStm, encryption or compressed xref |
| ZIP / DOCX / XLSX | signature, or central directory if signature damaged | CRC-32 per entry, central directory vs local headers | restores local signatures in place; rebuilds a ZIP from verified entries; readable prefix of a broken Deflate stream (unverified) | no ZIP64, encryption or methods other than stored/Deflate |
| TXT | content heuristics (tolerates a few NULs) | strict UTF-8 scan with exact damaged byte ranges | recovers intact lines; repaired text marks lost bytes with `�` | encoding is an estimate without BOM; lost bytes are never guessed |
| Raw disk image | n/a | read-only signature carving of contiguous files | extracts candidates and analyses each | no file systems, fragments or deleted-file metadata |
| GIF | signature | header, block structure, complete frames, trailer | keeps complete frames and adds the trailer | **no LZW decoding**; pixels not verified |
| BMP | `BM` + header checks | headers, declared vs. present rows, declared size | missing rows filled with zeros (flagged as filler), size corrected | RLE only by header; filler is not recovered data |
| WAV | `RIFF…WAVE` | `fmt `/`data` chunks, declared vs. present audio | trims to whole samples, fixes RIFF/data sizes | no audio decoding; PCM has no checksum |
| TIFF, WebP, MP3, MP4, SQLite, OLE2… | signature only | none | none | reported as "recognised, not analysed" |
| Executables / scripts | signature | none | none | identified and flagged; **never executed** |

The live capability matrix is also inside **File Recovery → Capability matrix** and is checked by automated tests.

## What is new in this edition

- Own **Deflate compressor** (LZ77 + fixed Huffman) so examples use real compression; the engine's own decoder, not a copy of the original, recovers them.
- **PNG repair verified by Adler-32**: damaged CRC fields, signature or IEND are repaired without touching image bytes.
- **Signature-damaged files** are identified by internal structure (PNG IHDR, ZIP central directory).
- **ZIP**: local header signature restoration (in place), unverified readable prefix exported separately.
- **Text**: exact damaged byte ranges, intact-line recovery, honest `�` marking.
- **Resurrection Lab**, **guided demo**, **TRY QUETZAL NOW**, deterministic **diagnosis explainer**, bilingual (ES/EN) with light/dark/system themes.

## Run locally

Requires Node.js 22.12+ (22.x, 24.x or 26+).

```sh
npm ci
npm run dev        # http://localhost:3000
npm test           # 345 tests
npm run lint
npm run typecheck
npm run build && npx next start -p 4173
```

Browser E2E: with the production build open, paste [scripts/e2e-lab-console.js](scripts/e2e-lab-console.js) into the browser console. It runs the nine examples, checks that the browser itself decodes the recovered GIF/BMP/WAV and that each download matches the report's SHA-256.

## Architecture

```
bytes (in memory, read-only) → identify (signatures / structure) → format analyzer → report
                                          │                           │              │
                                    lib/filerec/identify.ts   png / jpeg / pdf / zip / text / gif / bmp / wav   SHA-256, findings,
                                                                                              damaged ranges (+sectors),
                                                                                              verified items, repair
Lab:  lib/filerec/lab.ts (examples + runner + checks against the original) → app/resurrection-lab.tsx
```

See [docs/competition-brief.md](docs/competition-brief.md), [docs/architecture.md](docs/architecture.md), [docs/recuperacion-universal.md](docs/recuperacion-universal.md) (engine audit and roadmap, Spanish) and [docs/test-log.md](docs/test-log.md).

## Safety and privacy

Files are processed in memory in your browser and never sent anywhere. Limits: 8 MiB per file, 1000 entries, 16 MiB per stream, 64 MiB total, 200:1 decompression ratio, 8 s per file. ZIP entry names are normalised against zip-slip. Programs are identified but never run. No environment variables or paid services are required.

## Credits

**Kiro:** the repository carries Kiro steering and two Kiro-format specs in [.kiro/](.kiro/); there are **no Kiro hooks**, and implementation was done with Claude Code. The exact, evidence-based statement is in [docs/KIRO.md](docs/KIRO.md).

MIT licence applies to the code, not to the brand imagery.

## Project timeline (evidence)

The first commit is `35a708a`, **2026-10-30 20:22 (−06:00)**, i.e. on the day the Kiroween 2026 submission period opened; the history is public and linear (`git log --reverse`). Phases: DBF archaeology (Oct 30–31) → tabular engine 2.0 → universal file recovery → 3D/2.5D hologram → Quetzalito → ES/EN + themes → Competition Winner Edition (Resurrection Lab, GIF/BMP/WAV, accessibility; Nov 2).

## Screenshots

Recent captures (production build) are in [docs/capturas-lab/](docs/capturas-lab/): Dashboard with TRY QUETZAL NOW, PNG original/damaged/recovered, partial ZIP, and GIF/BMP/WAV recoveries on desktop and a 375 px phone viewport.

## For judges

Start at **[docs/JUDGES.md](docs/JUDGES.md)** (English, 90-second path, what is recoverable vs. only diagnosed, how to verify). Release status and requirement checklist: [docs/RELEASE-CANDIDATE.md](docs/RELEASE-CANDIDATE.md).
