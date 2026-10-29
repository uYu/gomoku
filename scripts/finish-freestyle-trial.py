#!/usr/bin/env python3
"""Verify a short freestyle model, then compare raw and guarded zero-search play."""
import importlib.util
import json
import re
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'.build/experiments/mix9svq-freestyle-trial-v1'
spec=importlib.util.spec_from_file_location('finish',ROOT/'scripts/finish-nnue-experiment.py')
finish=importlib.util.module_from_spec(spec);spec.loader.exec_module(finish)

def main():
    finish.correct_model_description(RUN,'mixed')
    source=ROOT/'models/rapfi/config.toml';base=source.read_text()
    official=re.sub(r'(?m)^((?:binary_file|weight_file(?:_black|_white)?)\s*=\s*")([^"]+)(")',lambda m:m[1]+str((source.parent/m[2]).resolve())+m[3],base)
    candidate=official.replace(str((source.parent/'mix9svqfreestyle_bsmix.bin.lz4').resolve()),str(RUN/'mixed/network.bin.lz4'))
    changed=[{'official':a,'scratch':b} for a,b in zip(official.splitlines(),candidate.splitlines()) if a!=b]
    if len(changed)!=1 or not changed[0]['official'].startswith('weight_file = '):raise ValueError('Expected only freestyle weight replacement')
    (RUN/'official-policy.toml').write_text(official);(RUN/'scratch-policy.toml').write_text(candidate)
    proof={'comparison':'Same native C++ executable, configuration and zero-search policy command; only freestyle neural weight path differs.','engine_binary_sha256':finish.sha(ROOT/'.build/native/bin/pbrain-rapfi'),'official_config_sha256':finish.sha(RUN/'official-policy.toml'),'scratch_config_sha256':finish.sha(RUN/'scratch-policy.toml'),'official_network_sha256':finish.sha(source.parent/'mix9svqfreestyle_bsmix.bin.lz4'),'scratch_network_sha256':finish.sha(RUN/'mixed/network.bin.lz4'),'changed_lines':changed}
    (RUN/'model-only-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    for color in ('black','white'):
        subprocess.run([str(ROOT/'.build/nnue-env/bin/python'),'scripts/check-nnue-codec.py','--checkpoint',str(RUN/'mixed/best.pt'),'--network',str(RUN/'mixed/network.bin.lz4'),'--color',color,'--rule','freestyle','--check-policy','--output',str(RUN/f'codec-{color}.json')],cwd=ROOT,check=True)
    subprocess.run(['node','--experimental-strip-types','scripts/compare-zero-policy.ts',str(RUN)],cwd=ROOT,check=True)
    subprocess.run(['node','--experimental-strip-types','scripts/audit-zero-policy.ts',str(RUN)],cwd=ROOT,check=True)
    checks=[test for color in ('black','white') for test in json.loads((RUN/f'codec-{color}.json').read_text())['tests']]
    audit=json.loads((RUN/'audit.json').read_text())
    with (RUN/'MATCH_REPORT.md').open('a') as report:
        report.write(f'\n推理核对：六个局面的 PyTorch/C++ 策略概率最大误差 {max(t["policy_max_absolute_difference"] for t in checks):.3g}，WDL 最大误差 {max(t["max_absolute_difference"] for t in checks):.3g}。{audit["games"]} 盘与开局后 {audit["movesChecked"]} 手已逐手审计。\n')
        if audit['counterexamples']:
            example=audit['counterexamples'][0]
            report.write(f'\n实战反例见 four-counterexamples.json。第一个反例是原版第 {example["game"]} 局第 {example["ply"]} 手：应堵 {example["forcedCoordinate"]}，却下到 {example["rawCoordinate"]}。missed-four.json / blocked-four.json 可导入游戏比较。\n')

if __name__=='__main__':main()
