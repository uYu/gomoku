#!/usr/bin/env python3
"""Select reproducible, legal, side-specific samples for local NNUE experiments."""
import hashlib
import importlib.util
import json
import random
import sys
from collections import Counter
from pathlib import Path
import numpy as np
from line_encoding_cpp import transform_board_to_line_encoding
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('clean',ROOT/'scripts/prepare-renjunet.py')
clean=importlib.util.module_from_spec(spec);spec.loader.exec_module(clean)
OUT=ROOT/'.build/training/nnue-samples-v1'
SEED=20261029

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def reservoir_add(pool, item, seen, maximum, rng):
    if len(pool)<maximum: pool.append(item)
    else:
        i=rng.randrange(seen)
        if i<maximum: pool[i]=item

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    native=clean.NativeDataset()
    family_split,known_games={},set()
    pools={};seen=Counter();source_counts=Counter()
    limits={'train':{'renjunet':48000,'gomocup2025':16000},'validation':{'renjunet':2048,'gomocup2025':1024},'test':{'renjunet':4096,'gomocup2025':1024}}
    rngs={}
    def add_game(split,source,moves,winner,game_id,family):
        source_counts[(split,source)]+=1
        # Cap each game per side so long games do not dominate the sampling pool.
        for color in (1,2):
            eligible=list(range(8+(color-1),len(moves),2))
            g_rng=random.Random(f'{SEED}:{source}:{game_id}:{color}')
            for ply in g_rng.sample(eligible,min(4,len(eligible))):
                key=(split,source,color)
                pool=pools.setdefault(key,[])
                rng=rngs.setdefault(key,random.Random(f'{SEED}:{key}'))
                seen[key]+=1
                reservoir_add(pool,(moves[:ply],moves[ply],winner,source,game_id,family),seen[key],limits[split][source],rng)
    manifest=json.loads((ROOT/'.build/training/renjunet/manifest.json').read_text())
    for split in ('train','validation','test'):
        file=ROOT/f'.build/training/renjunet/{split}.jsonl'
        if sha(file)!=manifest['splits'][split]['records_sha256']: raise ValueError('RenjuNet checksum mismatch')
        with file.open() as stream:
            for line in stream:
                record=json.loads(line)
                family=record['family']
                if family in family_split and family_split[family]!=split: raise ValueError('Opening leakage')
                family_split[family]=split;known_games.add(record['game_key'])
                if record['tournament'].get('rated')!='1': continue
                add_game(split,'renjunet',record['moves'],record['winner'],record['sources'][0]['id'],family)
        print('selected human candidates',split,flush=True)
    # 2026 is not used for learning labels. 2025 engine games add strong play diversity.
    for record in json.loads((ROOT/'.build/datasets/gomocup2025-legal-private.json').read_text()):
        if not record['geometric_winner']: continue
        if not any(any(name in player.upper() for name in ('RAPFI','KATAGOMO','ALPHAGOMOKU')) for player in record['players_in_file_order']): continue
        moves=record['moves'];status,_,won=native.validate(moves)
        if status or won!=record['geometric_winner'] or len(moves)<12: continue
        game_key,family_key=native.identity(moves,6)
        game_key=hashlib.sha256(game_key).hexdigest()
        if game_key in known_games: continue
        known_games.add(game_key)
        family=hashlib.sha256(family_key).hexdigest()
        split=family_split.get(family)
        if split is None:
            bucket=int(hashlib.sha256((str(SEED)+family).encode()).hexdigest(),16)%10
            split='train' if bucket<8 else 'validation' if bucket==8 else 'test'
            family_split[family]=split
        add_game(split,'gomocup2025',moves,won,record['archive_member'],family)
    result={'seed':SEED,'rule':'renju','source_manifest_sha256':sha(ROOT/'.build/training/renjunet/manifest.json'),'source_game_counts':{str(k):v for k,v in source_counts.items()},'selection':'Rated RenjuNet games; geometric finishes in Gomocup 2025 games involving Rapfi/KataGomo/AlphaGomoku. Full-game D4 dedup, shared opening-family assignment across sources. At most four positions per game per color.','augmentation':'One seeded random D4 transform per selected position; native legal mask includes black forbidden moves.','samples':{},'terms':'Private offline research; files and resulting experimental weights remain in .build, outside website/public assets.'}
    used_families={}
    for split in ('train','validation','test'):
        for color in (1,2):
            items=[item for source in ('renjunet','gomocup2025') for item in pools.get((split,source,color),[])]
            rng=random.Random(SEED+color+len(split));rng.shuffle(items)
            n=len(items)
            boards=np.zeros((n,2,15,15),dtype=np.int8)
            lines=np.empty((n,4,15,15),dtype=np.int32)
            legal=np.empty((n,29),dtype=np.uint8)
            targets=np.empty(n,dtype=np.int64);values=np.empty(n,dtype=np.int64)
            families=[];ids=[];sources=[]
            for i,(prefix,target,winner,source,game_id,family) in enumerate(items):
                s=rng.randrange(8)
                def transform(point):
                    r,c=divmod(point,15)
                    if s>=4:c=14-c
                    for _ in range(s%4): r,c=c,14-r
                    return r*15+c
                prefix=[transform(p) for p in prefix];target=transform(target)
                for ply,p in enumerate(prefix): boards[i,0 if 1+ply%2==color else 1,p//15,p%15]=1
                mask=np.frombuffer(native.legal_mask(prefix),dtype=np.uint8)
                if not mask[target]: raise ValueError('Illegal training target')
                legal[i]=np.packbits(mask,bitorder='little')
                transform_board_to_line_encoding(boards[i],lines[i],11,raw_code=False)
                targets[i]=target;values[i]=2 if winner==0 else 0 if winner==color else 1
                families.append(family);ids.append(source+':'+game_id);sources.append(source)
                if family in used_families and used_families[family]!=split: raise ValueError('Cross-source opening leakage')
                used_families[family]=split
            name=f'{split}-'+('black' if color==1 else 'white')
            path=OUT/(name+'.npz')
            np.savez_compressed(path,board=boards,line=lines,legal=legal,policy=targets,value=values,family=np.asarray(families),game_id=np.asarray(ids),source=np.asarray(sources))
            result['samples'][name]={'positions':n,'sources':dict(Counter(sources)),'families':len(set(families)),'sha256':sha(path)}
            print('wrote',name,n,flush=True)
    (OUT/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':main()
