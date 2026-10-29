#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v em++ >/dev/null 2>&1; then
  if [ -n "${EMSDK_ROOT:-}" ] && [ -f "$EMSDK_ROOT/emsdk_env.sh" ]; then . "$EMSDK_ROOT/emsdk_env.sh";
  elif [ -f ../otello/.build/emsdk/emsdk_env.sh ]; then . ../otello/.build/emsdk/emsdk_env.sh;
  else echo 'Emscripten is required to rebuild the rule adapter.' >&2; exit 1; fi
fi
export EM_CACHE="$PWD/.build/em-cache"
mkdir -p public/engine
em++ cpp/rules.cpp third_party/rapfi/Rapfi/game/board.cpp third_party/rapfi/Rapfi/game/pattern.cpp third_party/rapfi/Rapfi/core/hash.cpp -Ithird_party/rapfi/Rapfi/external/lz4/include -Ithird_party/rapfi/Rapfi/external/cpptoml/include -std=c++17 -O3 -DNDEBUG -flto -fexceptions --no-entry -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sSTACK_SIZE=2MB -sEXPORTED_FUNCTIONS='["_gm_rules_input","_gm_rule_forbidden","_gm_forbidden_map"]' -sEXPORTED_RUNTIME_METHODS='["HEAP32"]' -sENVIRONMENT=web,worker,node -o public/engine/rules.js
