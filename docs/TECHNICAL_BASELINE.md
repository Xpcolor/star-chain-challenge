# 星链算式 · 星舰对战

Chinese browser game with a vanilla JavaScript frontend and an authenticated Worker/SQLite records API. Three shared arithmetic tracks, both hands public, sixteen unlockable opponents. Source and generated spacecraft art are kept in this Site's Git repository.

## Rules

- Both players start with18HP and6cards. Before initiative, one shared starfield is sampled for the whole match. Both players choose from the same three modules sampled from six; the robot commits before the human picks, then both modules are revealed. Each player equips exactly one module. Both roll a six-sided die; ties reroll. The winner acts first for this match. The second player receives1/2/3 one-use shield points at actual levels1–6/7–12/13–16 respectively, which absorb damage across hits until exhausted and never regenerate. Both still start with18HP. Dice never recur during ordinary rounds.
- Play one number or W card on a shared track with +/−. W substitutes any chosen1–9. A requires two ordinary number cards in clicked order, each with its own sign. J is a standalone reflection from x to20−x, unavailable at10 and not a +/− operation. The44-card deck contains36 numbers, W3, A3, J2. Every intermediate/final position must be0–20; final position must change.
- Public E/P/L goals deal1/2/3damage for the current action, up to two goals. Module and starfield bonuses apply to attacks meeting their stated conditions. Each module has a finite activation limit; starfield bonuses persist for the match. Automatic selection maximizes attack (including shield removal) plus newly completed repair rewards; a lethal combination takes priority. Attack power does not accumulate.
- Three shared repair contracts (1/1/2HP rewards) are drawn from12 short conditions. Both players track their own progress on those exact contracts. The first to complete a contract heals; only claimed slots are replaced for both players. Replacement resets both players' progress for that slot, while untouched contracts retain progress. No same-action retroactive credit or refresh chains. Healing has no18HP cap.
- Confirm applies opponent damage and own healing once as one transaction, then shows a short beam/repair animation. Controls lock until it completes. HP0 ends immediately, before refill or a reply.
- Otherwise refill to6 from three public cards or random draw. Rest discards0–2 cards, optionally replaces one public goal, and refills; no movement/damage/healing. Rest breaks the player's ongoing attack streak and consecutive module/sector attacks; collected circuit colors remain.
- At round12, skip refills; after both actions, compare remaining HP, equal means draw. ZeroHP still ends immediately.
- A new match resets module usage and draws a different starfield from the preceding match in the current session. There is no daily lock, collection or permanent stat growth. Records use the existing Site sign-in. Winning unlocks according to the actual played level. Older three/six/nine-level saves migrate into version6 by opponent identity. Every two consecutive losses offers support: only explicit acceptance lowers the next match by one level; refusal preserves the current difficulty. Another two losses offers a new choice, cumulatively down to1. Two wins recover one level up to the selected level. Draws reset streaks, abandoned matches do not count. Refresh starts a new match. See docs/RECORDS_API.md for recording, offline outbox and future-only tuning.

## Presentation

The selected third concept supplies the layout: public attack goals left, opposing spacecraft and numbered tracks center, shared repairs right, hand/supply/confirmation below. All63 numerical ticks are DOM text. A permanent “已选牌” summary clears on confirmation. Public supply and “随机抽1张” share the refill phase. The opening three-option module picker precedes the one-time dice overlay. During play, a compact shared starfield banner and expandable module summaries show each effect, remaining activations, and relevant color history. Attack/healing previews show module bonuses, starfield bonuses, and shield absorption. The dice overlay disappears after initiative resolves. Round count sits between the two HP displays; repair color/sign history stays below each progress bar. Sixteen opponent buttons use the existing six spacecraft designs. Each level has a distinct spacecraft color/motion signature using the six existing ship designs. Support mode is shown beside the selected opponent name, with the actual difficulty stated explicitly. End-of-match advice reconstructs public decision positions and gives one factual example or a repair/module/supply suggestion; it does not promise a win.

Eight image assets are served locally under `dist/assets`: player, six enemies and space backdrop. All craft have real alpha. There are no external fonts, scripts or runtime image providers. CSS respects reduced-motion and responsive viewports.

## Source and verification

- `dist/engine.mjs`: arithmetic/card rules, initiative, atomic combat, refill, endings, AI with public observations only.
- `dist/tactics.mjs`: six modules, six starfields, bounded module progress and pure bonus previews.
- `dist/challenges.mjs`: public repair catalog, per-contract progress, claim previews and shared replacement.
- `dist/app.mjs`: interaction, animation scheduling, reset cancellation, rule/result dialogs and optional browser agent controls.
- `dist/progress.mjs`: bounded legacy progress migration and cache.
- `dist/difficulty.mjs`: calibrated sixteen-level parameters, cumulative support and bounded future tuning.
- `dist/advice.mjs`: replay-backed, public-information post-match advice.
- `dist/records.mjs`, `dist/record-client.mjs`: versioned replay records and retryable IndexedDB outbox.
- `server/worker.mjs`, `db/schema.ts`, `drizzle/`: authenticated owner-scoped persistence, immutable completed records and versioned settings.
- `scripts/build.mjs`: frontend assets and Worker build.
- `dist/style.css`, `dist/index.html`: responsive static shell.

Install with `npm ci`; run `npm test` and `npm run build`. Schema changes require `npm run db:generate`; inspect generated migrations before deployment. Do not rewrite migrations that have been applied. Both append-only migrations are bundled in `dist/.openai/drizzle`; the second adds explicit support decisions.

Frontend source remains in `dist/` for continuity with the previous static release. Build output is `dist/client` and `dist/server`, both ignored by Git. `.openai/hosting.json` declares the logical D1 binding `DB`. The platform supplies authentication and provisions the database; there are no checked-in secrets.
Tests cover dice/ties, card legality, atomic damage/healing, unlimited HP, targeted shared refresh, no retroactive rewards, lethal and round-limit endings, old saves, wild selection, both refill sources, restart cancellation and end-to-end UI handlers. The engine suite includes80 complete matches across all sixteen policies, plus36 mirrored pairs verifying exact actor symmetry. Draft tests cover360 seeds; shield tests cover partial absorption, no regeneration, AI valuation, and preview/settlement agreement. Simulation output describes synthetic agents, not human win rates or proven difficulty balance.

The UI harness uses a minimal DOM and clock. Real-browser visual/animation QA and supported-browser WebMCP QA are unavailable in the current environment. Records tests use actual in-memory SQLite and deterministic replay; authentication tests inject trusted platform headers at the Worker boundary. Optional agent control registration is feature detected; the ordinary UI does not depend on it. Deployment success is not claimed as browser QA.

`node tests/balance.mjs [count]` is an optional reproducible tuning script using a fixed synthetic reference policy; it is not a required publication check.

`node tests/fairness.mjs [samples-per-pair] [seed] [greedy|sampled] [matrix|baseline] [shield]` exercises every module pairing and starfield with paired initiative swaps. The baseline disables modules, sectors and shielding. See `docs/BALANCE.md` and its raw reports for the repeated tuning results and limitations.

## Current difficulty validation

Three independent banks of72 scenarios, paired first/second starts, two fixed reference strategies and16 levels yield13,824 games. The two earlier calibration banks reused unchanged profiles when inserting level10; that profile was separately tested on both banks, then the entire ladder was tested on a third bank. Independent mirror tests identified excess low-level compensation; after testing fixed1/2/3-point compensation by actual grade, levels1–12 were rerun on all three reference banks. Unchanged levels13–16 retain their original rows. Two separate mirror banks then checked all16 grades. The initial15-level pilot is excluded from the final report.

For each seed in `[57108419, 2381707, 99174013]`, run `node tests/ladder.mjs ladder 72 SEED output-SEED.jsonl`. Summarize those three files with `node tests/summarize-ladder.mjs output-57108419.jsonl output-2381707.jsonl output-99174013.jsonl`. The archived final rows are in `docs/balance/sixteen-release-games.jsonl.gz`; run the same summarizer on that file to independently recompute the curve. See `docs/SIXTEEN_LEVELS.md` and `docs/balance/sixteen-release-summary.json` for results, uncertainty and source fingerprints. Older balance reports describe earlier releases and remain historical evidence.
