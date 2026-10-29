#!/usr/bin/env python3
"""Model-only matches: identical official Rapfi AB, only black/white NNUE differs."""
import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def correct_model_description(run,color):
    # Upstream export uses git from its working directory, which in an unpacked
    # trainer can report the unrelated parent repository. Keep the raw export
    # and label the deployable copy from the actual pinned trainer provenance.
    import lz4.frame
    path=run/color/'network.bin.lz4'
    raw=lz4.frame.decompress(path.read_bytes())
    magic,arch,rules,sizes,length=struct.unpack('<5I',raw[:20])
    if magic!=0xacd8cc6a:raise ValueError('Invalid NNUE header')
    if b'local-scratch-run=' in raw[20:20+length]:return
    backup=path.with_name('network.upstream.bin.lz4')
    if not backup.exists():shutil.copyfile(path,backup)
    report_path=run/color/'report.json';report=json.loads(report_path.read_text())
    trainer=json.loads((ROOT/'third_party/nnue-trainer/UPSTREAM.json').read_text())['revision']
    description=f'model=mix9svq_basicns_64f32p64v32d65536c; local-scratch-run={run.name}; color={color}; random-init; step={report["selected_step"]}; trainer={trainer}'
    payload=raw[20+length:];encoded=description.encode()
    corrected=struct.pack('<5I',magic,arch,rules,sizes,len(encoded))+encoded+payload
    temporary=path.with_suffix('.tmp');temporary.write_bytes(lz4.frame.compress(corrected,content_checksum=True,compression_level=3));temporary.replace(path)
    assert lz4.frame.decompress(path.read_bytes())[20+len(encoded):]==payload
    report.update({'upstream_export_sha256':sha(backup),'network_sha256':sha(path),'network_payload_sha256':hashlib.sha256(payload).hexdigest(),'description_correction':'Pinned trainer revision replaces parent-repository git hash; neural parameter payload unchanged.'})
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    status_path=run/color/'status.json';status=json.loads(status_path.read_text());status['network_sha256']=sha(path);status_path.write_text(json.dumps(status,indent=2)+'\n')

def make_model_only_configs(run):
    source=ROOT/'models/rapfi/config.toml';base=source.read_text()
    def absolute(match):return match[1]+str((source.parent/match[2]).resolve())+match[3]
    reference=re.sub(r'(?m)^((?:binary_file|weight_file(?:_black|_white)?)\s*=\s*")([^"]+)(")',absolute,base)
    candidate=reference
    for color in ['black','white']:
        candidate,count=re.subn(rf'(?m)^(weight_file_{color}\s*=\s*")[^"]+("\s*)$',lambda match:match[1]+str(run/color/'network.bin.lz4')+match[2],candidate)
        if count!=1:raise ValueError('Expected exactly one Renju NNUE path per color')
    changed=[{'official':left,'scratch':right} for left,right in zip(reference.splitlines(),candidate.splitlines()) if left!=right]
    if len(changed)!=2 or any(not row['official'].startswith(('weight_file_black','weight_file_white')) for row in changed):raise ValueError('Non-model configuration changed')
    official=run/'official-ab.toml';scratch=run/'scratch-ab.toml'
    official.write_text(reference);scratch.write_text(candidate)
    proof={'comparison':'Same official C++ executable, AB search and complete configuration; only Renju black/white NNUE paths differ.','source_config_sha256':sha(source),'official_config_sha256':sha(official),'scratch_config_sha256':sha(scratch),'changed_lines':changed,'classical_table_sha256':sha(ROOT/'models/rapfi/classical.bin'),'engine_binary_sha256':sha(ROOT/'.build/native/bin/pbrain-rapfi')}
    (run/'model-only-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    return scratch,official

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);args=parser.parse_args()
    run=(ROOT/args.run).resolve()
    if not run.is_relative_to(ROOT/'.build'):raise ValueError('Local research output required')
    def update(phase,**extra):(run/'status.json').write_text(json.dumps({'phase':phase,'scope':'official AB; only neural model changes',**extra},indent=2)+'\n')
    update('preparing_model_only_comparison')
    for color in ['black','white']:correct_model_description(run,color)
    scratch,official=make_model_only_configs(run)
    update('checking_quantized_cpp_inference')
    for color in ['black','white']:
        subprocess.run([str(ROOT/'.build/nnue-env/bin/python'),'scripts/check-nnue-codec.py','--checkpoint',str(run/color/'best.pt'),'--network',str(run/color/'network.bin.lz4'),'--color',color,'--output',str(run/f'codec-{color}.json')],cwd=ROOT,check=True)
    for label,config in [('scratch',scratch),('official',official)]:
        with (run/f'cpp-load-{label}.json').open('w') as log:
            subprocess.run(['node','--experimental-strip-types','scripts/analyze.ts','--config',str(config),'--rule','renju','--moves','H8,I8,H9,G7','--time','100'],cwd=ROOT,check=True,stdout=log)
    update('selecting_held_out_openings')
    if not (run/'openings.json').exists():subprocess.run(['node','--experimental-strip-types','scripts/prepare-nnue-openings.ts',str(run/'openings.json')],cwd=ROOT,check=True)
    results=[]
    for budget,pairs in [(100,8),(500,4)]:
        name=f'scratch-ab-vs-official-ab-{budget}ms'
        update('paired_matches',comparison=name,completed=len(results),total=2)
        output=run/(name+'.json')
        command=['node','--experimental-strip-types','scripts/benchmark.ts','--first','scratch-ab','--second','official-ab','--first-config',str(scratch),'--second-config',str(official),'--rule','renju','--openings',str(run/'openings.json'),'--pairs',str(pairs),'--time',str(budget),'--fresh-process-per-game','--output',str(output)]
        with (run/(name+'.log')).open('w') as log:subprocess.run(command,cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
        report=json.loads(output.read_text());results.append({key:report[key] for key in ['first','second','timeMs','firstWins','draws','secondWins','firstScore','measuredMoves','measuredMs','stateIsolation']})
        (run/'model-only-results.json').write_text(json.dumps({'comparisons':results},indent=2)+'\n')
    summary={'scope':'Only NNUE model replacement in official Rapfi AB; no search algorithm or parameter changes. MCTS search comparison deferred by user instruction.','model_type':'mix9svq','initialization':'random; no official pretrained neural weights loaded','black':json.loads((run/'black/report.json').read_text()),'white':json.loads((run/'white/report.json').read_text()),'comparisons':results,'opening_sha256':sha(run/'openings.json'),'model_only_proof':json.loads((run/'model-only-proof.json').read_text()),'claim':'Exploratory CPU training and small paired matches; no Elo or superiority claim. Research weights remain outside public assets.'}
    (run/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    update('complete',comparisons=len(results))
    print(json.dumps({'comparisons':results},indent=2))
if __name__=='__main__':
    try:main()
    except Exception as error:
        parser=argparse.ArgumentParser();parser.add_argument('--run');args,_=parser.parse_known_args()
        if args.run:(ROOT/args.run/'status.json').write_text(json.dumps({'phase':'failed','error':repr(error)},indent=2)+'\n')
        raise
