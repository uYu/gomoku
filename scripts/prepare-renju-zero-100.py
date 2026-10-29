#!/usr/bin/env python3
"""Freeze 50 unseen Renju opening families and model-only configs before play."""
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'.build/experiments/renju-zero-policy-100-v1'
SEED=20261029
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def main():
    if RUN.exists():raise ValueError('Preserve existing run; choose a fresh output directory')
    RUN.mkdir(parents=True)
    spec=importlib.util.spec_from_file_location('clean',ROOT/'scripts/prepare-renjunet.py')
    clean=importlib.util.module_from_spec(spec);spec.loader.exec_module(clean)
    native=clean.NativeDataset()
    samples=ROOT/'.build/training/nnue-samples-v2'
    sample_manifest=json.loads((samples/'manifest.json').read_text())
    excluded=set()
    for split in ('train','validation'):
        for color in ('black','white'):
            path=samples/f'{split}-{color}.npz'
            if sha(path)!=sample_manifest['samples'][f'{split}-{color}']['sha256']:raise ValueError('Sample hash mismatch')
            with np.load(path,allow_pickle=False) as data:excluded.update(data['family'].tolist())
    source=ROOT/'.build/training/renjunet/test.jsonl'
    dataset=json.loads((source.parent/'manifest.json').read_text())
    if sha(source)!=dataset['splits']['test']['records_sha256']:raise ValueError('Test record hash mismatch')
    records=[json.loads(line) for line in source.open()]
    records=[r for r in records if r['tournament'].get('rated')=='1' and r['family'] not in excluded]
    records.sort(key=lambda r:hashlib.sha256((str(SEED)+r['game_key']).encode()).hexdigest())
    seen=set();openings=[]
    for record in records:
        family=record['family']
        if family in seen:continue
        moves=record['moves'][:6]
        status,_,winner=native.validate(moves)
        if status or winner or len(moves)!=6:continue
        _,key=native.identity(moves,6)
        if hashlib.sha256(key).hexdigest()!=family:raise ValueError('Opening family mismatch')
        seen.add(family)
        openings.append({'moves':moves,'family':family,'gameId':record['sources'][0]['id']})
        if len(openings)==50:break
    if len(openings)!=50:raise ValueError('Not enough held-out families')
    opening_report={'rule':'renju','seed':SEED,'source':'RenjuNet rated records in the original test split','selection':'Source game-key SHA-256 seeded order; one real six-ply prefix per distinct D4 colored opening family. Exclude all black/white training and validation sample families. No model evaluation, balancing search or match outcome used to select openings. Six stones cannot already contain an immediate five.','excluded_learning_families':len(excluded),'source_sha256':sha(source),'sample_manifest_sha256':sha(samples/'manifest.json'),'openings':openings}
    (RUN/'openings.json').write_text(json.dumps(opening_report,indent=2)+'\n')
    old=ROOT/'.build/experiments/mix9svq-scratch-r15-v2'
    official=(old/'official-ab.toml').read_text();scratch=(old/'scratch-ab.toml').read_text()
    differences=[{'official':a,'scratch':b} for a,b in zip(official.splitlines(),scratch.splitlines()) if a!=b]
    if len(official.splitlines())!=len(scratch.splitlines()) or len(differences)!=2 or any(not row['official'].startswith(('weight_file_black','weight_file_white')) for row in differences):raise ValueError('Non-model configuration difference')
    (RUN/'official-policy.toml').write_text(official);(RUN/'scratch-policy.toml').write_text(scratch)
    models={}
    for color in ('black','white'):
        candidate=old/color/'network.bin.lz4';training=json.loads((old/color/'report.json').read_text())
        if sha(candidate)!=training['network_sha256']:raise ValueError('Scratch network changed')
        reference=ROOT/f'models/rapfi/mix9svqrenju_bs15_{color}.bin.lz4'
        models[color]={'scratch_path':str(candidate),'scratch_sha256':sha(candidate),'official_path':str(reference),'official_sha256':sha(reference),'selected_step':training['selected_step'],'initialization':training['initialization']}
    proof={'comparison':'Identical native C++ executable and full configuration; only Renju black/white neural paths differ. Both use actual Renju models, raw-float neural policy, identical direct-win/block-four guard and authoritative black foul masks; no AB/MCTS/VCF or opening-book use.','rule':'renju','pairs':50,'total_games':100,'guard':True,'engine_binary_sha256':sha(ROOT/'.build/native/bin/pbrain-rapfi'),'opening_sha256':sha(RUN/'openings.json'),'official_config_sha256':sha(RUN/'official-policy.toml'),'scratch_config_sha256':sha(RUN/'scratch-policy.toml'),'changed_lines':differences,'models':models}
    (RUN/'model-only-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    (RUN/'status.json').write_text(json.dumps({'phase':'prepared','pairs':50,'total_games':100},indent=2)+'\n')
    print(json.dumps({'openings':50,'unique_families':len(seen),'excluded_learning_families':len(excluded),'run':str(RUN)},indent=2))

if __name__=='__main__':main()
