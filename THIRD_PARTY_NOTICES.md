# Third-party sources

## Rapfi C++ engine

- Project: https://github.com/dotb1ue/rapfi
- Source revision: `1387d11312190ec66665d361ff07a7c70221b78a`.
- Copyright: Rapfi developers; see `third_party/rapfi/AUTHORS`.
- License: GPL-3.0-or-later; full text in `LICENSE` and `third_party/rapfi/Copying.txt`.
- The complete source is vendored under `third_party/rapfi`. Included dependency
  licenses remain in the corresponding `Rapfi/external` directories.
- Local change: the Emscripten link flags export an ES module, target web/worker/Node,
  and omit imported-memory/Closure flags. The playing/search/evaluation code is
  unchanged from the pinned revision.
- `public/engine/source.tar.gz` provides the corresponding engine sources,
  build scripts, configurations and model files alongside the downloadable binary.
  The footer links to this archive and the GPL text.

## Official pretrained weights

- Source: https://github.com/dotb1ue/rapfi-networks
- Revision: `7eeb19b55219a48138756293f92211a1539bab4d`.
- License: CC0-1.0; full text in `models/rapfi/LICENSE-CC0`.
- Mix9svq freestyle/standard/Renju black-and-white networks and classical 260809/220723 models are
  upstream pretrained artifacts. They are **not newly trained in this project**.
- `trained.bin` is a local fine-tune of the 220723 classical move-ordering tables.
  Its training recipe, publisher dataset license, exact hashes and metrics are
  recorded separately. It does not replace the pretrained NNUE weights.

## WinePy public game records

- Dataset: https://huggingface.co/datasets/Karesis/Gomoku
- Pinned revision: `5cf594efdcddcba688965e3bdcab37f2a89d714b`.
- Publisher: Karesis / WinePy, https://github.com/Karesis/Winepy.
- The publisher dataset card declares the dataset MIT licensed. That original
  card is preserved in `data/raw/DATASET_CARD.md`; this project does not infer a
  broader license for other game databases or tournament records.
- The original 875 self-play records are retained as `data/raw/winepy-games.json`,
  not described as expert human tournament games.

React, Lucide, Vite and other npm dependency licenses remain available through
those packages. This distribution uses GPL-3.0-or-later for the game and adapter;
third-party data and weights retain the licenses stated above.

## Additional personal research collections

Official Gomocup 2025/2026 results archives are downloaded only under ignored
`.build/datasets/`. They are not included in the game, public assets or source
archive, and are not relicensed as MIT/CC0. See `docs/DATA_SOURCES.md` for source
links, hashes, actual PSQ audits and the distinction between local research and
redistribution. RenjuNet has also been downloaded for personal offline study; its database
has not been bundled or used for the distributed model.
