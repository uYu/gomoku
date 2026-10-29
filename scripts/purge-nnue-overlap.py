#!/usr/bin/env python3
"""Purge exact D4 position overlap from validation/test, preserving train data."""
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.build/training/nnue-samples-v1'
DEST=ROOT/'.build/training/nnue-samples-v2'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def position_key(board):
    merged=board[0]+2*board[1]
    return min(np.ascontiguousarray(np.rot90(merged if s<4 else np.flip(merged,axis=1),s%4)).tobytes() for s in range(8))
def main():
    DEST.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((SOURCE/'manifest.json').read_text())
    report={}
    for color in ['black','white']:
        earlier=set();report[color]={}
        for split in ['train','validation','test']:
            name=f'{split}-{color}';source=SOURCE/(name+'.npz');dest=DEST/(name+'.npz')
            if sha(source)!=manifest['samples'][name]['sha256']:raise ValueError('Input checksum mismatch')
            with np.load(source,allow_pickle=False) as archive:data={key:archive[key] for key in archive.files}
            retained=[];same_split=set();cross=within=0
            for i,board in enumerate(data['board']):
                key=position_key(board)
                if split!='train' and key in earlier:cross+=1;continue
                if split!='train' and key in same_split:within+=1;continue
                retained.append(i);same_split.add(key)
            earlier|=same_split
            if split=='train':shutil.copyfile(source,dest)
            else:
                data={key:value[retained] for key,value in data.items()}
                np.savez_compressed(dest,**data)
            count=len(retained)
            report[color][split]={'input_positions':len(retained)+cross+within,'retained_positions':count,'removed_cross_split':cross,'removed_within_split':within,'unique_positions':len(same_split)}
            manifest['samples'][name]={'positions':count,'sources':dict(Counter(data['source'].tolist())),'families':len(set(data['family'].tolist())),'sha256':sha(dest)}
    manifest['parent_manifest_sha256']=sha(SOURCE/'manifest.json')
    manifest['position_purge']='For each side, canonicalize all 8 D4 colored positions. Keep train unchanged; remove validation positions in train and duplicate validation positions; remove test positions in train/validation and duplicate test positions. Input boards only, no test labels used for model selection.'
    manifest['position_purge_statistics']=report
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
