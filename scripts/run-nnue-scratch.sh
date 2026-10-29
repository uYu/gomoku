#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export KEOPS_CACHE_FOLDER="$PWD/.build/keops"
export OMP_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=2
NNUE_SDK=$(xcrun --show-sdk-path)
export CPLUS_INCLUDE_PATH="$NNUE_SDK/usr/include/c++/v1"
NNUE_RUN=.build/experiments/mix9svq-scratch-r15-v2
mkdir -p "$NNUE_RUN"
.build/nnue-env/bin/python -u scripts/train-nnue-scratch.py --color black --run "$NNUE_RUN" --steps 2000 --threads 2 > "$NNUE_RUN/black.log" 2>&1 &
NNUE_BLACK_PID=$!
.build/nnue-env/bin/python -u scripts/train-nnue-scratch.py --color white --run "$NNUE_RUN" --steps 2000 --threads 2 > "$NNUE_RUN/white.log" 2>&1 &
NNUE_WHITE_PID=$!
NNUE_EXIT=0
wait "$NNUE_BLACK_PID" || NNUE_EXIT=1
wait "$NNUE_WHITE_PID" || NNUE_EXIT=1
if [ "$NNUE_EXIT" -ne 0 ]; then
 echo 'NNUE training/export failed; inspect black.log and white.log' >&2
 exit 1
fi
.build/nnue-env/bin/python scripts/finish-nnue-experiment.py --run "$NNUE_RUN"
