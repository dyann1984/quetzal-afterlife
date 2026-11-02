# QUETZAL AFTERLIFE — competition brief

> Contest rules: the official Kiroween rules could not be retrieved (the Devpost rules page returned HTTP 403, and secondary sources describe the 2025 edition). **No requirement is asserted here that has not been verified.** Check the current official rules before submitting.

## The problem
Damaged files (a broken CRC, an erased signature, a cut download, zeroed sectors) usually get one answer from common tools: "corrupt file". QUETZAL asks: *what part of this is still verifiably recoverable?* — and proves it.

## Innovation
1. **Recovery with an honesty contract.** Every recovered element carries a `verified` flag backed by a concrete check (CRC-32, Adler-32, SHA-256, re-analysis). Unverifiable data is labelled, exported separately, and never presented as recovered.
2. **Own Inflate and Deflate.** The decoder returns the *valid prefix* of damaged compressed streams and the byte where they failed (native streams just throw). The compressor generates real-compression test files deterministically.
3. **Repairs that do not touch data bytes.** A PNG whose pixels verify via Adler-32 gets only its CRC/signature/IEND restored; the result is SHA-256-identical to the original.
4. **Identification by structure when the signature is gone** (PNG via IHDR position, ZIP via central directory).
5. **Verifiable demo.** The Lab compares engine output against a reference original (hash, lines, entries, rows) and includes a case that *must* be reported unrecoverable.
6. **Local-first.** Nothing is uploaded; limits against decompression bombs and zip-slip are enforced.

## Differentiators vs. a "pretty demo"
- Real bytes, real parsers, real progress (stages and timings are measured, not animated).
- A negative control (example 5) that proves the engine does not fabricate data.
- 345 automated tests plus a browser E2E script (`scripts/e2e-lab-console.js`, 23/23 checks), including cross-checks against Node's zlib and fuzz-style truncation/corruption.
- Capability matrix kept honest by tests.

## 3-minute judge script (matches the in-app guided demo)
| Time | Step | What the judge sees |
|---|---|---|
| 0:00 | Problem | Why "corrupt file" is not an answer |
| 0:20 | Identity | Electric-blue / gold quetzal hologram: blue = analysed, gold = verified |
| 0:40 | Damaged file | PNG with 3 altered CRC bytes; the browser cannot open it |
| 1:00 | Real analysis | Hashing → identification → analysis/repair, with measured timings |
| 1:25 | Before / after | Original · damaged · recovered side by side |
| 1:50 | Verification | SHA-256 of the recovered file equals the original; confidence level derived from checksums |
| 2:15 | Download | Recovered file, safe ZIP, JSON report; the other eight examples (incl. GIF, BMP, WAV) |
| 2:40 | Innovation | Honesty contract, own Deflate, structure-based identification |

Manual path: Dashboard → **TRY QUETZAL NOW** → *Run all 9 examples* → read the summary table (all nine show their checks ✓; example 5 shows confidence NONE and examples 7–9 confidence LOW, both by design).

**For a non-technical judge:** each result opens with the confidence level and a plain-language explanation ("Quetzalito explains", deterministic rules). Examples 7–9 can be *seen and heard*: the original, damaged and recovered GIF/BMP are shown by the browser's own decoder, and the WAV has three audio players (1.5 s original, 0.825 s recovered).

## Artificial intelligence: what is and is not claimed
- The explanation panel and the assistant (Quetzalito) are **deterministic rule/keyword systems**. They are labelled as such in the UI.
- A generative-AI assistant is feasible but would require an API, credentials and per-use cost. It is **not** enabled and would need explicit authorisation.

## Test evidence (reproducible)
Run: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Results for this branch are logged in [test-log.md](test-log.md). Notable tests: `lib/filerec/lab.test.ts` (Deflate vs Node zlib; each Lab example's checks; exact SHA-256 equality for examples 1 and 3; negative control), `lib/filerec/explain.test.ts`.

One original assertion was updated: the Quetzalito test that counted 13 sections now expects 14 because *Resurrection Lab* was added as a section.

## Known limitations
- JPEG: structure only; no pixel decoding or pixel verification.
- PDF: no object streams, encryption or compressed xref.
- ZIP: no ZIP64/encryption; Office files rebuilt as ZIP are not opened with Office in tests.
- No file-system parsing (FAT/NTFS/ext) and no fragmented-file reassembly.
- PNG repair of truncated files recovers only whole, CRC-valid chunks (rows beyond that are not guessed).
- The hologram is the previously approved asset; improving its artistry needs the commissioned 3D model (see `docs/encargo-3d/`).
- GIF/BMP/WAV: structure only (no LZW decoding, no audio decoding); their pixels/samples are never marked verified, and the BMP repair fills missing rows with zeros. Tested only with synthetic files.
- Lighthouse (headless Chrome, software WebGL): accessibility 100, best practices 100, SEO 100; performance 54–67 because the headless run renders the hologram without a GPU (Total Blocking Time ≈ 1 s). With WebGL disabled the same page scores 87 (TBT 30 ms); on a real Intel UHD 630 GPU the browser recorded no long tasks. Details in test-log.

## Kiro contributions
Specs in `.kiro/specs/` (DBF archaeology, inventory reconstruction) and steering files precede this branch and are preserved untouched. This branch's work is documented in the commit history (`git log feat/integracion-final..feat/competition-winner-edition`).
