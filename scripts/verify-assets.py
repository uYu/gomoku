#!/usr/bin/env python3
"""Verify pinned source/model/data/build assets; --write intentionally updates hashes."""
import argparse
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/manifest.json'
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if args.write:
        paths = [*sorted((ROOT / 'models/rapfi').glob('*')), ROOT / 'data/raw/winepy-games.json', ROOT / 'data/raw/DATASET_CARD.md', ROOT / 'public/engine/rapfi.js', ROOT / 'public/engine/rapfi.wasm', ROOT / 'public/engine/rapfi.data', ROOT / 'public/engine/source.tar.gz', ROOT / 'public/engine/rules.js', ROOT / 'public/engine/rules.wasm', ROOT / 'cpp/rules.cpp', ROOT / 'cpp/dataset.cpp', ROOT / 'CMakeLists.txt', ROOT / 'scripts/build-rules.sh']
        sources = sorted(path for path in (ROOT / 'third_party/rapfi/Rapfi').rglob('*') if path.is_file())
        source_hash = hashlib.sha256()
        for path in sources:
            source_hash.update(str(path.relative_to(ROOT)).encode() + b'\0' + path.read_bytes())
        value = {'rapfi_revision': '1387d11312190ec66665d361ff07a7c70221b78a', 'networks_revision': '7eeb19b55219a48138756293f92211a1539bab4d', 'dataset_revision': '5cf594efdcddcba688965e3bdcab37f2a89d714b', 'engine_source_sha256': source_hash.hexdigest(), 'files': {str(path.relative_to(ROOT)): digest(path) for path in paths if path.is_file()}}
        MANIFEST.write_text(json.dumps(value, indent=2) + '\n')
    value = json.loads(MANIFEST.read_text())
    for name, expected in value['files'].items():
        actual = digest(ROOT / name)
        if actual != expected:
            raise SystemExit('SHA-256 mismatch: ' + name)
    source_hash = hashlib.sha256()
    for path in sorted(path for path in (ROOT / 'third_party/rapfi/Rapfi').rglob('*') if path.is_file()):
        source_hash.update(str(path.relative_to(ROOT)).encode() + b'\0' + path.read_bytes())
    if source_hash.hexdigest() != value['engine_source_sha256']:
        raise SystemExit('Rapfi source hash mismatch; rebuild before updating the manifest')
    print(f"Verified {len(value['files'])} assets and the complete C++ source hash")
if __name__ == '__main__':
    main()
