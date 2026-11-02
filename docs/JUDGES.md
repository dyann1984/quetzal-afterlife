# Judge guide — QUETZAL AFTERLIFE

**Category: Resurrection.** QUETZAL revives *damaged legacy-format files* — the kind that "no longer open" — and states, byte by byte, what is verifiably recoverable and what is not. Everything runs in your browser; files are never uploaded.

No account, API key, paid service or technical knowledge is needed.

## 90-second path (no technical knowledge needed)

1. Open the app. On the **Dashboard** press the gold **TRY QUETZAL NOW** button. You land in **Resurrection Lab**.
2. Press **Run all 9 examples** and wait a few seconds. A summary table appears: every example shows its checks ✓.
3. Click any example card and read, from top to bottom:
   - **Confidence level** (HIGH / MEDIUM / LOW / NONE) and the reason it was given.
   - **Original · Damaged · Recovered** side by side (images are shown by *your browser's own decoder*; example 9 has three audio players).
   - **"Quetzalito explains"** — plain-language explanation. It is a deterministic rule system built from the technical report, **not generative AI**.
   - **Verification against the original** — checks computed by comparing the engine's output with a reference original.
   - **SHA-256 fingerprints** — for examples 1 and 3 the recovered file's hash equals the original's (byte-identical).
4. Press **Download recovered file** and compare the file with the original (`Download` next to "Reference original").

Prefer a narrated tour? Press **▶ Guided demo · 3 min** on the Dashboard (8 steps; steps 4–7 run the real engine, nothing is pre-recorded).

Language and theme: the **ES / EN** buttons and the **Theme** selector (light / dark / system) are in the header.

## What each example proves

| # | File | Result | Why it matters |
|---|---|---|---|
| 1 | PNG with altered CRC-32 fields | **Full**, byte-identical (SHA-256 match) | Only control fields were broken; pixels verify by Adler-32 |
| 2 | Text with zeroed/garbage bytes | **Partial**: 9 of 13 lines identical, losses marked `�` | Never guesses lost bytes |
| 3 | DOCX with altered `PK` signatures | **Full**, byte-identical | Identified by structure when the signature is gone |
| 4 | ZIP with one damaged Deflate stream | **Partial**: 2 of 3 entries verified by CRC-32 | The damaged one is offered only as a prefix labelled **NOT verified** |
| 5 | PNG overwritten with random data | **Unrecoverable** (confidence NONE) | Negative control: the engine refuses to invent data |
| 6 | PNG truncated at 60 % | **Partial**: rows from complete, CRC-valid chunks | Recovered rows are identical to the original's |
| 7 | Animated GIF cut mid-frame | **Partial**: 2 of 4 frames kept | Browser decoder reads exactly 2 frames; pixels *not verified* |
| 8 | BMP truncated (60 of 96 rows) | **Partial**: rows present identical; the rest is **zero filler** | Filler is labelled; it is not recovered data |
| 9 | WAV cut at 55 % mid-sample | **Partial**: 0.825 s of 1.5 s, sizes corrected | Browser decodes 0.825 s; samples *not verified* |

Examples 7–9 deliberately get **LOW** confidence: GIF pixels, BMP pixels and PCM samples carry no checksum, so the engine never claims they are verified.

## What can be recovered vs. what can only be diagnosed

| Level | Formats | What QUETZAL does |
|---|---|---|
| **Repair, verified by checksums** | PNG, ZIP/DOCX/XLSX (stored + Deflate), TXT | Restores control fields / signatures, extracts verified entries, intact lines; re-analyses its own repair |
| **Repair, structure only (content unverified)** | JPEG (adds EOI), GIF, BMP, WAV, PDF (text of intact Flate streams, xref rebuild) | Fixes the container; pixels/samples are labelled NOT verified |
| **Diagnosis only** | TIFF, WebP, MP3, MP4/MOV, MKV, FLAC, Ogg, AVI, OLE2 (.doc/.xls), SQLite (header only), 7z, RAR, GZIP | Identified by signature; "recognised, not analysed" |
| **Identified, never executed** | EXE/ELF/Mach-O/scripts | Flagged as programs; never run or loaded |
| **Out of scope** | File systems (FAT/NTFS/ext), deleted-file recovery, fragmented files, encrypted files, RAW camera formats | Not implemented; stated in the in-app capability matrix |

The same table lives in the app: **File Recovery → Capability matrix**, and automated tests keep it from claiming more than exists.

## How to verify our claims yourself

| Claim | How to check |
|---|---|
| Results are real, not animated | Stage timings in each result are measured. Nothing is uploaded: running all 9 examples produced **0** fetch/XHR/beacon requests in our check (re-check in DevTools → Network) |
| Recovered = original (examples 1, 3) | Compare the SHA-256 rows; or download both files and hash them |
| Browser decodes recovered media | Examples 7–9 render/play in the page; the E2E script measures it (below) |
| Tests | `npm ci && npm test` → **345 tests** (26 files) |
| Types, lint, build | `npm run typecheck`, `npm run lint`, `npm run build` |
| Browser E2E | Run `npm run build && npx next start -p 4173`, open it, paste [`scripts/e2e-lab-console.js`](../scripts/e2e-lab-console.js) into the console → `OK: 23/23` (also passes in Microsoft Edge) |

## Honest limits

- All test files are **synthetic** (generated by code, deterministic). No real-world corrupted GIF/BMP/WAV/PDF/DOCX was available; real files may behave differently.
- Recovery is never universal. Overwritten data is gone; QUETZAL says so.
- **"AI"**: the explanation panel and the assistant *Quetzalito* are deterministic rules and keyword matching. No model, no API, no network call. This is labelled in the UI.
- The sections *Discovery, Recovery, Schema Intelligence, Reconstruction, AI Analyst, Resurrection Studio, Evidence Vault, Verification* and *Laboratorio* belong to the earlier tabular engine (DBF/CSV archaeology). They show a guided empty state ("no evidence yet" + a link) until you import a file in *Nueva recuperación* (press **▶ DEMO** for sample data) or load the **synthetic scenario** from *Discovery*. They are not broken. The judging path above does not need them.
- Browsers tested: Chrome 152 and Microsoft Edge 156 (both Chromium, Windows, Intel UHD 630 GPU). **Not tested**: Safari, Firefox, real phones. Mobile layouts were tested by emulation at 375 px.
- Performance: Lighthouse (headless, no GPU) gives Accessibility 100, Best Practices 100, SEO 100 and Performance 54–67 because the 3D hologram is software-rendered there; the same page scores 87 with WebGL disabled.

## Relation to legacy technology

The project started from **dBASE/FoxPro (DBF) and CSV archaeology** — data trapped in obsolete systems — and extended to damaged files in long-lived formats (PNG, ZIP/OOXML, GIF, BMP, WAV, PDF, legacy text encodings). The "dead technology" being revived is the *file that nobody's current software can open*: QUETZAL rebuilds it with modern techniques (own Inflate/Deflate, checksum-verified repair, browser-side processing).

## Where to look in the code

| Area | Path |
|---|---|
| Format identification | `lib/filerec/identify.ts` |
| Analyzers | `lib/filerec/{png,jpeg,pdf,zip,text,media}.ts` |
| Own Inflate/Deflate, CRC-32, Adler-32 | `lib/filerec/core.ts` |
| Lab examples + checks against originals | `lib/filerec/lab.ts` |
| Plain-language explainer (rules, not AI) | `lib/filerec/explain.ts` |
| Lab UI / guided demo | `app/resurrection-lab.tsx`, `app/guided-demo.tsx` |
| How Kiro was (and was not) used | [KIRO.md](KIRO.md) |
