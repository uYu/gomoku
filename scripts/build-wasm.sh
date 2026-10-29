#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v emcmake >/dev/null 2>&1; then
  if [ -n "${EMSDK_ROOT:-}" ] && [ -f "$EMSDK_ROOT/emsdk_env.sh" ]; then
    . "$EMSDK_ROOT/emsdk_env.sh"
  elif [ -f ../otello/.build/emsdk/emsdk_env.sh ]; then
    . ../otello/.build/emsdk/emsdk_env.sh
  else
    echo 'Install Emscripten or set EMSDK_ROOT to rebuild the browser engine.' >&2
    exit 1
  fi
fi
export EM_CACHE="$PWD/.build/em-cache"
mkdir -p public/engine
python3 scripts/stage-engine.py
emcmake cmake -S third_party/rapfi/Rapfi -B .build/wasm -DCMAKE_BUILD_TYPE=Release -DNO_COMMAND_MODULES=ON -DNO_MULTI_THREADING=ON -DUSE_WASM_SIMD=ON -DUSE_WASM_SIMD_RELAXED=OFF
cmake --build .build/wasm -j 4
cp .build/wasm/rapfi-single-simd128.js public/engine/rapfi.js
cp .build/wasm/rapfi-single-simd128.wasm public/engine/rapfi.wasm
cp .build/wasm/rapfi-single-simd128.data public/engine/rapfi.data
sh scripts/build-rules.sh
python3 scripts/package-engine-source.py
