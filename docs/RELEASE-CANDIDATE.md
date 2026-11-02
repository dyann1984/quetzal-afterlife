# Release Candidate 1 — QUETZAL AFTERLIFE (Kiroween 2026)

Prepared 2026-11-02. **Nothing described here has been pushed, merged or deployed.** The exact commit is the one tagged `competition-rc1` (see the hand-over message; a document cannot contain its own hash).

## 0. Publication status (updated 2026-11-02)

| Item | Status |
|---|---|
| GitHub branch | `feat/competition-winner-edition` published (RC1 `0c399a7`, then `b3487df` Kiro task and `72ff3ea` E2E fix); default branch and `feat/kiroween-resurrection` untouched, nothing merged |
| Public demo | **https://quetzal-kiroween.vercel.app** — separate Vercel project `quetzal-kiroween` (Hobby plan, no environment variables, no secrets copied), production branch `feat/competition-winner-edition`, deployed from commit `72ff3ea` |
| Original site | `quetzal-afterlife.vercel.app` (project `quetzal-afterlife`) unchanged: same production deployment, domain, branch and protection |
| Verified anonymously | fresh Chrome and Edge profiles: 0 failed/blocked requests, React hydrated, buttons work; 23/23 E2E in both; ES/EN × desktop/mobile navigation (14 sections each); 0 console errors |
| Still open | Kiro execution evidence (`.kiro/EVIDENCE.md` empty), public video link, confirming the 2026 rules |

Sections 1–7 below are the original RC1 analysis and are kept as written.

## 1. Repository state

| Item | Finding |
|---|---|
| Remote | `https://github.com/dyann1984/quetzal-afterlife` — **public**, licence detected as MIT |
| GitHub default branch | `feat/fase-4-estabilizacion` (no `main`) |
| Our branch on GitHub | **Absent.** `feat/competition-winner-edition` has never been pushed |
| Commits GitHub lacks | **29** (the default branch is an ancestor of our branch; 0 commits behind), covering Oct 31 → Nov 2: 3D/hologram experience, universal recovery, Quetzalito, ES/EN + themes, integration, Competition Winner Edition |
| Parallel remote branch | `origin/feat/kiroween-resurrection` (6 commits, 2026-11-01, same base `b0d8e74`): JSON/XML/CSV/SQLite analyzers, 6-stage protocol, Playwright E2E, Kiroween notes. **Diverged**: 6 commits each way; a dry merge reports **6 conflicting files** (README, `globals.css`, `test-log.md`, `lib/filerec/index.ts`, `lib/filerec/text.ts`, `lib/quetzalito/kb.ts`). It was **not** merged and nothing from it was copied |
| Local untracked (left untracked on purpose) | `docs/encargo-3d/`, `docs/referencia/rodin/`, `tools/blender/quetzal.blend*` — 30 files, 21.9 MB, art commission/reference material; review for third-party rights before ever committing |

## 2. Safety review before publishing (repository is public)

| Check | Result |
|---|---|
| Secrets in the **entire history of every branch** (AWS/GitHub/OpenAI/Slack tokens, JWTs, private keys, `password=`/`token=` literals) | none found |
| `.env.local` (contains a Vercel OIDC token) | ignored by `.gitignore`, never tracked, not in history |
| Personal paths / e-mail addresses in tracked files | none |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Licence | `LICENSE` (MIT) at root; MIT covers code, not the brand imagery |
| Largest tracked assets | `public/models/quetzal.glb` 2.4 MB, `public/quetzal-logo.png` 2.3 MB — acceptable |
| Dependencies | all declared in `package.json` / lockfile, pinned |

## 3. Tests (this commit, Windows, Node 22.23)

| Check | Result |
|---|---|
| `npm test` | **345 / 345**, 26 files |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | OK; routes `/` and `/_not-found` static |
| Browser E2E `scripts/e2e-lab-console.js` | **23 / 23** in Chrome 152 *and* Edge 156 (hash of each download = hash in report; GIF 2 of 2 frames decode; WAV decodes to 0.825 s) |
| Console errors during the E2E | none (Edge, captured through DevTools protocol) |
| axe-core | 0 violations (14 sections, 9 examples, demo, hologram, Quetzalito; light/dark × ES/EN) |
| Lighthouse (headless, software WebGL) | Accessibility 100 · Best Practices 100 · SEO 100 · Performance 54–67 (87 with WebGL off; no long tasks on a real GPU) |
| Network during Lab run | 0 fetch/XHR/beacon requests (nothing uploaded) |
| Responsive | 375 / 768 / 1280 px: no horizontal overflow |
| Sections without content | none blank; 9 engine-2.0 sections show a *guided empty state* with an action link until evidence is loaded |

**Not tested:** Safari, Firefox, real phones/tablets, real-world damaged GIF/BMP/WAV/PDF/DOCX files, audio through speakers, low-end device performance.

## 4. Comparison with production

`https://quetzal-afterlife.vercel.app` was fetched on 2026-11-02 and its JavaScript inspected. It contains *File Recovery* and *Quetzalito* but **not** *Resurrection Lab*, *TRY QUETZAL NOW*, the guided demo or the GIF/BMP/WAV analyzers. It is therefore an **older build** (the exact deployed commit cannot be determined from outside). Production must be redeployed from the release commit for judges to see this work. The README says so until that happens.

## 5. Official requirements checklist

The 2026 official rules page (`kiroween.devpost.com/rules`) returned HTTP 403 to every automated fetch, so **the 2026 text could not be read**. Third-party summaries state dates (submission 2026-10-30 → 2026-12-04, 2:00 PM Pacific), the *Resurrection* category ("bring a favourite dead technology back to life") and explicitly mark the requirement list as carried over from **2025, unconfirmed for 2026**. The checklist below uses those carried-over requirements and says what is verified. **The author must confirm each against the live rules.**

| Requirement (2025, carried over) | Status | Evidence / action |
|---|---|---|
| Project created inside the submission period | ✅ | First commit `35a708a` 2026-10-30 20:22 −06:00 (19:22 PDT) |
| Category *Resurrection* | ✅ fits | Legacy DBF/CSV archaeology + damaged-file revival; see `docs/JUDGES.md` |
| Public repository | ✅ currently public | GitHub API `private:false` — but see: **the final branch is not on it** |
| OSI licence visible | ✅ | MIT; GitHub detects it |
| Run instructions in repo | ✅ | README "Run locally" |
| `/.kiro` at root, not ignored | ✅ present | `.gitignore` does not list `.kiro` |
| `/.kiro` contains specs, **hooks**, steering | ⚠️ **hooks missing** | steering ×1, specs ×2; no hooks |
| Explanation of how Kiro was used | ⚠️ **cannot be completed truthfully yet** | `docs/KIRO.md` states the evidence; no proof of Kiro execution exists in the repo |
| Working application / test link | ❌ **not yet** | production runs an older build; redeploy needed |
| Text description | ✅ draft | README + `docs/competition-brief.md` + `docs/JUDGES.md` |
| Demo video < 3 min, public | ❌ **not provided** | none exists in the repo; the in-app guided demo (8 steps, 3:00) and the script in `docs/competition-brief.md` are aligned, but they **could not be compared with a video that was not supplied** |
| English materials | ✅ | README, JUDGES, KIRO, RELEASE-CANDIDATE, competition-brief, architecture summary |
| No false AI / recovery claims | ✅ reviewed | explainer and Quetzalito labelled deterministic; examples 7–9 LOW confidence; no "universal recovery" (tested) |

## 6. Critical pending items (decisions only the author can make)

1. **Kiro evidence.** Use Kiro for real work (or document real past use) and add true evidence; otherwise submit with the honest statement in `docs/KIRO.md`. Add hooks only after creating them in Kiro. Missing hooks/usage may fail a stated requirement.
2. **Publish the branch and redeploy** (procedure below). Until then judges see an older product.
3. **Default branch.** Make the final branch the default (or create `main`) *after* review; do not merge into the stale `feat/fase-4-estabilizacion`.
4. **Decide the fate of `origin/feat/kiroween-resurrection`.** It has valuable work (JSON/XML/SQLite analyzers, Playwright E2E) but conflicts in 6 files and overlaps docs. Options: leave it unmerged; or integrate later in a separate PR with its own tests. Not recommended in an RC.
5. **Video** (public, < 3 min) and its comparison with the live demo.
6. **Confirm the 2026 rules** (team size, categories, required fields).

## 7. Safe publishing procedure (each step needs the author's explicit approval)

```sh
# 0. Local safety copy (no network)
git bundle create ../quetzal-rc1-backup.bundle --all

# 1. Publish the review branch (new branch only: cannot overwrite anything)
git push -u origin feat/competition-winner-edition
git push origin competition-rc1                 # optional tag

# 2. Review on GitHub: compare feat/fase-4-estabilizacion...feat/competition-winner-edition (29 commits)

# 3. Preview: if the Vercel project is Git-connected it builds a preview URL for the pushed branch;
#    otherwise: npx vercel            (preview, NOT --prod)
#    Then paste scripts/e2e-lab-console.js in the preview's console -> expect OK: 23/23

# 4. Only after the preview passes and the author approves:
#    GitHub → Settings → Branches → Default branch → feat/competition-winner-edition (or create main from it)
#    Production deploy: promote the verified preview (vercel promote <url>) or `vercel --prod` from the tagged commit
#    Rollback: keep the previous deployment; tag `backup/produccion-pre-v2-bc445bf` already exists on the remote
```

No step above has been run.
