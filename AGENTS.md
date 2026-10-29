# Gomoku workspace guide

## Current product direction

Latest completed request: 100 Renju games, 50 distinct held-out six-ply D4
families with swapped colors. Both models use zero-search neural policy plus
the same direct-win/block-four guard and foul masks. Scratch Renju scored
11/0/89, black 7/0/43 and white 4/0/46. Raw scratch policy missed 12 unique
defenses; the guard fixed all 12 and 3 missed immediate wins. All 100 replays
and 3,669 post-opening moves were audited, no AI fouls or search nodes.
Artifacts: .build/experiments/renju-zero-policy-100-v1/MATCH_REPORT.md and
summary.json. Use this score only for equal zero-search conditions; do not
mix it with previous AB or freestyle results or infer a human beginner rating.

The user authorized one short freestyle trial on 2026-10-29: clean the 20,736
Gomocup 2025/2026 Freestyle15 PSQs, train random-init Mix9svq for 500 steps,
then compare to official freestyle weights with both sides at zero search.
Check missed direct four threats and, if present, add own-immediate-win / block
opponent-immediate-win priority, comparing both models under the same guard.
Run: .build/experiments/mix9svq-freestyle-trial-v1; samples:
.build/training/freestyle-trial-v1. Do not expand this into long training,
AB/MCTS research. The website's weights were not changed in this trial. Keep prior runs.
The main game still uses official Rapfi and pretrained NNUE weights.
The user then requested a playable launch. The isolated ?trial=freestyle page
now routes freestyle/easy and renju/easy moves through the Vite local-only C++ bridge in
server/beginner-trial.ts, using scratch-policy.toml and the verified zero-search
guard. Latest direction: Renju beginner now uses the existing random-init
Renju black/white models in mix9svq-scratch-r15-v2/scratch-ab.toml, with
modelRule=renju. Freestyle beginner keeps the 500-step freestyle trial model.
Both are zero-search with own-immediate-win/block-four checks and AI foul masks.
No new training was needed; keep both original experiment runs intact.
Human forbidden moves are now placed and immediately lose for black; retain
the black stone, foul kind and last move, show white victory with the cause,
and support save/replay/undo. AI output must still explicitly reject fouls.
A terminal foul is valid in imported saves; moves after it remain invalid.
Changing rules in the trial setup preserves the chosen difficulty.
Normal URLs and higher difficulties remain official browser Wasm. Normal/hard
now use upstream STRENGTH 20/95 at 600/2200ms (upstream root caps 7/15).
These are provisional playtest settings, not human ranks or strength percentages.
Hints remain full-strength 100 at the hard budget. Clear TT when stepping down
from a stronger setting so hints cannot influence weaker turns. Native analysis,
opening preparation, deterministic differential tests and model benchmarks use
fullStrength explicitly to preserve full-strength comparison conditions.
Keep the research weights in .build. Vite dev/preview retains the trial bridge.
Docker preparation now uses server/production.ts and the shared beginner-service
with a read-only private model mount; VITE_BEGINNER_API=1 enables scratch easy
on the normal production URL. It still requires the native build and private
weights, and is not a pure static-host endpoint. Prepare only the 3 inference
weights/configs with scripts/prepare-deployment-models.py, never entire datasets.
Live trial server: 127.0.0.1:5183. Preserve its user game; do not reset it for QA.
This trial is complete: both models at zero search, scratch lost 0/0/16 raw
and scored 1/0/15 with the same immediate-threat guard on both sides. In raw
matches it missed 3/37 unique defenses; guarded matches missed 0/37. 32 replays
and 837 played moves were audited. Test policy accuracy is 39.79%, not a win
rate. See docs/FREESTYLE_TRIAL.md and the run's MATCH_REPORT.md. This requested
short trial is finished; do not automatically extend the training run.
The freestyle casual rule now defaults to official Rapfi NNUE at easy strength,
using mix9svqfreestyle_bsmix.bin.lz4 (protocol rule 0). Renju remains the serious
default with its dedicated black/white models (rule 4). Existing experimental
model support is retained only for old-save/CLI compatibility. The game has no
engine picker; every newly started or restarted game uses official Rapfi NNUE.
Beginner uses upstream strength 0, root depth 1, 40ms and 256-node budgets;
clear its TT before searching so hard hints cannot supply deeper cached analysis.
Keep upstream tactical checks and authoritative forbidden rules. These settings
are a handicap, not a human rating or a guarantee of novice win rates.

This is the independent Gomoku application in this directory, visually inspired
by the sibling otello project. Do not modify that sibling or copy its models or
datasets. Its installed Emscripten SDK may be used read-only; write caches here.

## Build and verify

- Node.js >=22.13: `npm ci`, `npm test`, `npm run build`.
- `npm run dev`: 127.0.0.1:5178. No backend or external AI service is needed.
- `npm run build:native`: CMake/C++17 engine + native trainer.
- `npm run test:native`: native/Wasm differential checks at fixed node budgets.
- `npm run training:prepare`: regenerate .build/training/renju from real data/raw inputs.
- `python3 -m unittest discover -s tests -p '*_test.py'`: data/training checks.
- `npm run assets:verify`: verify exact models, data, Wasm and C++ sources.
- `npm run build:wasm`: rebuild with Emscripten; prebuilt files are versioned so
  normal frontend builds do not need Emscripten. Set EMSDK_ROOT if needed.

## Engine, rules and ownership

Rapfi is vendored at pinned revision 1387d11312190ec66665d361ff07a7c70221b78a.
Respect GPL-3.0-or-later and retain all third-party notices. Official weights are
CC0. Do not call this engine a new from-scratch implementation. Local upstream
edits change Wasm packaging flags and add a native-only NNPOLICY diagnostic
under COMMAND_MODULES. It exposes raw NNUE policy with no move picker, VCF,
value-head evaluation or search; the browser build excludes it. Existing
playing/search algorithms are unchanged.
Package corresponding source with scripts/package-engine-source.py after changes.

The serious default is Renju for both NNUE and trained engines, human/AI/hints/
watch modes and imported replays. Use the authoritative Rapfi-backed bridge in
cpp/rules.cpp (small rules.wasm) for black double-three, double-four and overline;
include recursive false-three handling and exact-five priority. White >=5 wins.
The separate casual freestyle mode defaults to easy. Exact-five is retained only
for old save compatibility. Free placement is not a tournament swap opening.

AI stays in a Web Worker. Reuse it after successful requests to preserve weights
and TT; terminate on cancellation. Never apply results to a different game,
replay position, or undone state. Imported saves must be validated by full replay.
Old v1 saves without an engine field migrate to Rapfi NNUE.

## Training and measured strength

See docs/ENGINE.md, data/README.md and models/training-report.json. Raw public
WinePy games are real and stored locally. Preserve provenance, licenses and
checksums. Never treat a public download as permission to relabel its license.

The trained model fine-tunes 1634 Renju classical move-ordering parameters; it does not
retrain the official NNUE. Split complete games after D4 deduplication. Do not
leak game groups or choose checkpoints by the test set.

The historical goal was to aim beyond Rapfi; this work is now paused. Make claims only from recorded paired
matches with fixed rules, time budgets, threads and held-out openings. Keep
full move records and actual timings. Prediction loss and search depth are not
strength claims. Historical freestyle-v2 lost 3/1/12 to NNUE on balanced openings. The current
Renju smoke match is only 4 games (2/0/2), not strength evidence.
NNUE remains the recommended default. Do not advertise that the target is met.

Keep Chinese UI, cream/sage/forest palette, responsive/keyboard and reduced-motion
support. Exclude node_modules, dist, .build, generated Networks staging, caches and
TypeScript build metadata. Hash manifest updates are intentional: do not run
verify-assets.py --write merely to silence a mismatch.

## Random-initialized NNUE experiment

The user explicitly changed the plan to training from random initialization,
then authorized starting. Do NOT fine-tune or distill official neural weights.
Current local run: .build/experiments/mix9svq-scratch-r15-v2. Initial v1 was
cancelled because selected samples had rare cross-split transpositions; use
nnue-samples-v2, purged by exact D4 position as well as opening families.
Train black/white Mix9svq separately with full 65536-entry codebooks; codebooks
update by EMA and mapping/conv/heads by backprop. Preserve random initial
checkpoints, provenance, learning curves and validation-selected weights.

RenjuNet-derived datasets and new models remain local research artifacts under
.build, excluded from public/ and source.tar.gz. Do not replace the working game
model merely because loss improves. Compare identical candidate weights under
AB and MCTS, same budgets/threads/paired held-out openings; check quantized C++
inference first. Codec preflight files marked sparse-test-only are NOT game
models and must never be used in benchmarks. See docs/NNUE_FROM_SCRATCH.md.

Latest requested comparison is model-only official AB, completed: 100ms 2/0/14
and 500ms 1/0/7 (scratch win/draw/loss), with fresh process per game. The complete
configs differ only in black/white neural weights; classical tables, search and
engine binary are identical. See model-only-proof.json and MATCH_REPORT.md in
the run directory. 24 replay files were fully validated. Old mixed-search results
are archived under prior-search-comparison and must not be mixed into this score.
MCTS cross-search comparison is deferred by the user's latest instruction.

Terminal UX: never auto-open a result dialog or blur/cover the board. Show a
nonmodal result card in place of the players panel, retain the final move and
winning-line highlights, and provide one-ply rewind plus replay/restart actions.
Forbidden endings also show red rings and dashed lines on the contributing
threes, fours or entire overline, with stronger emphasis on the last stone.
src/game/foul-lines.ts explains already-adjudicated fouls using authoritative
legality checks for continuations; it does not change adjudication. Result
reasons are large, high-contrast blocks, with foul type, losing side and point.
Replay before the foul removes the explanation; returning restores it.

Keep the sidebar focused on players/results and move history. The filler
“棋间一隅” card and visible engine search statistics were removed by user request.

## Deployed boardgame hall and server constraints

The user explicitly authorized deployment to 162.14.123.217 on 2026-10-29.
LATEST CONSTRAINT: never modify Homepage, its container/config or port 80.
The boardgame gateway listens separately on 8210. All old game ports remain.
Homepage container ID/start time and compose/services/settings SHA-256 were
compared before/after deployment and match exactly.

Live hall: http://162.14.123.217:8210/boardgame/
Gomoku: /boardgame/gomoku/ on that origin, plus original-style direct port 8209.
Othello URL spelling is /boardgame/othello/, forwarding to the existing 8207.
The five-stone game's brand, Home and main-menu controls must return to its
own menu. The user explicitly removed the extra return-to-hall navigation.

Deployment directory: /root/app/gomoku. Containers: gomoku-gomoku-1 and
boardgame-gateway. Existing game containers have not been recreated or edited.
Gateway/Compose and operational details are under deploy/. Do not integrate
cards into Homepage or move it to 8300; those former plans were revoked.
Use the IP directly, no domain registration.

The server's Docker registry proxy is unavailable; do not modify global proxy
settings or restart Docker. The deployed image was built with the cached
Emscripten image and deploy/Dockerfile.prebuilt. The build needs x86 SSE (Mix10
cannot compile purely scalar); runtime is scratch plus Node and required libs,
not the full builder image. Private scratch weights remain read-only in
.build/runtime-models, excluded from Git, static assets and source downloads.

Hall sources: public/boardgame. Category/search filters, real game links,
optional last-opened link, responsive layout and accessible controls are present.
Modern Art and Heaven & Ale have root-relative URLs in their existing bundles;
server/legacy-proxy.ts rewrites only new-path HTML/JS/CSS responses and scopes
replay API/image/Worker requests, leaving the old ports' original bytes intact.
The old Othello /api/native/health returns 404; the new compatibility route
preserves that status. Its existing browser AI remains the production path.

scripts/verify-deployment.py checks all 9 new routes and old ports, static and
Worker resources, policy zero-search/block-four/foul masks, replay APIs and
private-file isolation. Remote evidence is saved under .build; do not publish
research datasets or private model artifacts as part of deployment reports.
