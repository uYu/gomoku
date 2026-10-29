# Training inputs

`raw/winepy-games.json` contains the actual 875 public WinePy self-play games.
The publisher's MIT dataset card is beside it; revision and SHA-256 are recorded
in `manifest.json` and `../THIRD_PARTY_NOTICES.md`.

The current experiment is Renju. First build the native rules library with
`npm run build:native`, then run `npm run training:prepare`. The standard-library
Python pipeline calls the same Rapfi-backed C++ forbidden-move checker as the
browser. It rejects invalid coordinates/turns/repeated squares, black forbidden
moves, continuations after wins and unfinished games, then deduplicates entire
games under all eight D4 symmetries before a seeded 80/10/10 game split.

The original games were freestyle, not expert Renju. Retaining only full games
legal under Renju gives 339 unique games: 271/34/34 training/validation/test games,
8,729/1,042/1,203 positions after dropping four opening plies. Rejections include
355 forbidden-move games, 177 duplicates and 4 repeated-square records. Outputs
are under `.build/training/renju/`. Game groups never cross splits; common opening
positions across separate games can still overlap.

`python3 scripts/prepare-training.py --rule freestyle` reproduces the earlier
543-game experiment in `.build/training/`: 434/54/55 games and
12,636/1,487/1,810 positions. Its historical model/report is under
`models/experiments/`; do not compare its loss as if it were the Renju experiment.

Stronger official tournament archives have been downloaded and individually
checked for personal research. They are separate from the distributed WinePy
experiment and are not packaged into the app. See `../docs/DATA_SOURCES.md`.
