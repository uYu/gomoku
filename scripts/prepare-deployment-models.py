"""Stage existing scratch weights privately; never include datasets or checkpoints."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', default='.build/runtime-models')
parser.add_argument('--runtime-dir', default='/app/private')
parser.add_argument('--app-dir', default='/app')
args = parser.parse_args()
destination = ROOT / args.output
destination.mkdir(parents=True, exist_ok=True)
sources = {
    'freestyle.bin.lz4': ROOT / '.build/experiments/mix9svq-freestyle-trial-v1/mixed/network.bin.lz4',
    'renju-black.bin.lz4': ROOT / '.build/experiments/mix9svq-scratch-r15-v2/black/network.bin.lz4',
    'renju-white.bin.lz4': ROOT / '.build/experiments/mix9svq-scratch-r15-v2/white/network.bin.lz4',
}
for name, source in sources.items():
    shutil.copyfile(source, destination / name)
config = (ROOT / 'models/rapfi/config.toml').read_text()
for name in ['classical.bin', 'mix9svqfreestyle_bsmix.bin.lz4', 'mix9svqstandard_bs15.bin.lz4', 'mix9svqrenju_bs15_black.bin.lz4', 'mix9svqrenju_bs15_white.bin.lz4']:
    config = config.replace(f'"{name}"', f'"{args.app_dir}/models/rapfi/{name}"')
freestyle = config.replace(f'{args.app_dir}/models/rapfi/mix9svqfreestyle_bsmix.bin.lz4', f'{args.runtime_dir}/freestyle.bin.lz4')
renju = config.replace(f'{args.app_dir}/models/rapfi/mix9svqrenju_bs15_black.bin.lz4', f'{args.runtime_dir}/renju-black.bin.lz4').replace(f'{args.app_dir}/models/rapfi/mix9svqrenju_bs15_white.bin.lz4', f'{args.runtime_dir}/renju-white.bin.lz4')
(destination / 'freestyle.toml').write_text(freestyle)
(destination / 'renju.toml').write_text(renju)
manifest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(destination.iterdir()) if p.name != 'manifest.json' and p.is_file()}
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Staged {len(sources)} existing models and 2 configs in {destination}; no training data copied.')
