from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
dest = root / 'third_party/rapfi/Networks'
dest.mkdir(parents=True, exist_ok=True)
files = ['config.toml', 'classical.toml', 'classical.bin', 'mix9svqfreestyle_bsmix.bin.lz4', 'mix9svqstandard_bs15.bin.lz4', 'mix9svqrenju_bs15_black.bin.lz4', 'mix9svqrenju_bs15_white.bin.lz4']
if (root / 'models/rapfi/trained.bin').exists():
    files += ['trained.bin', 'trained.toml']
for name in files:
    shutil.copyfile(root / 'models/rapfi' / name, dest / name)
(dest / 'wasm_preloads.txt').write_text(''.join(f'{name}@/{name}\n' for name in files))
