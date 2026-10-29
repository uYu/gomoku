#!/usr/bin/env python3
"""Small private Freestyle15 trial from the two already downloaded Gomocup ZIPs."""
import hashlib
import importlib.util
import json
import random
import re
import zipfile
from collections import Counter
from pathlib import Path
import numpy as np
from line_encoding_cpp import transform_board_to_line_encoding

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.build/training/freestyle-trial-v1'
SEED=20261029
spec=importlib.util.spec_from_file_location('clean',ROOT/'scripts/prepare-renjunet.py')
clean=importlib.util.module_from_spec(spec);spec.loader.exec_module(clean)

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def parse_psq(text):
    lines=text.splitlines()
    if not lines or not lines[0].startswith('Piskvorky 15x15,'):raise ValueError('invalid_header')
    at=1;moves=[]
    while at<len(lines) and re.fullmatch(r'\d+,\d+,\d+',lines[at]):
        x,y,_=map(int,lines[at].split(','))
        if not (1<=x<=15 and 1<=y<=15):raise ValueError('coordinate')
        moves.append((y-1)*15+x-1);at+=1
    if len(lines[at:])!=4 or not re.fullmatch(r'[012],Freestyle15_[12]',lines[-1]):raise ValueError('invalid_tail')
    return moves,lines[at:]

def geometric_winner(moves):
    board=[0]*225;won=0
    for ply,point in enumerate(moves):
        if not 0<=point<225:raise ValueError('coordinate')
        if board[point]:raise ValueError('duplicate_square')
        if won:raise ValueError('moves_after_win')
        color=1+ply%2;board[point]=color
        row,col=divmod(point,15)
        for dr,dc in ((0,1),(1,0),(1,1),(1,-1)):
            length=1
            for sign in (-1,1):
                r,c=row+sign*dr,col+sign*dc
                while 0<=r<15 and 0<=c<15 and board[r*15+c]==color:
                    length+=1;r+=sign*dr;c+=sign*dc
            if length>=5:won=color
    return won

def transform(point,symmetry):
    row,col=divmod(point,15)
    if symmetry>=4:col=14-col
    for _ in range(symmetry%4):row,col=col,14-row
    return row*15+col

def position_key(board):
    merged=board[0]+2*board[1]
    return min(np.ascontiguousarray(np.rot90(merged if s<4 else np.flip(merged,axis=1),s%4)).tobytes() for s in range(8))

def main():
    if OUT.exists():raise ValueError('Use a fresh output directory; preserve previous sample sets')
    OUT.mkdir(parents=True)
    native=clean.NativeDataset();records=[];known=set();stats=Counter();sources={};rejected=[]
    for year in (2025,2026):
        path=ROOT/f'.build/datasets/gomocup{year}results.zip'
        sources[str(year)]={'url':f'https://gomocup.org/results/gomocup-result-{year}/','archive_sha256':sha(path)}
        with zipfile.ZipFile(path) as archive:
            names=sorted(n for n in archive.namelist() if n.startswith(('Freestyle15_1/','Freestyle15_2/')) and n.endswith('.psq'))
            for name in names:
                stats['input_games']+=1
                try:
                    moves,tail=parse_psq(archive.read(name).decode('utf-8-sig'))
                    winner=geometric_winner(moves)
                    if len(moves)<12:raise ValueError('short_record')
                    # Do not guess winner colors from the PSQ tail's player/result order.
                    if not winner and len(moves)!=225:raise ValueError('no_geometric_finish')
                    key,family=native.identity(moves,3)
                    if key in known:raise ValueError('D4_duplicate_game')
                    known.add(key)
                    records.append({'moves':moves,'winner':winner,'family':hashlib.sha256(family).hexdigest(),'id':f'{year}/{name}','metadata':tail})
                    stats['accepted_games']+=1
                except ValueError as error:
                    stats[str(error)]+=1;rejected.append({'id':f'{year}/{name}','reason':str(error)})
    splits=clean.split_families(records,SEED)
    manifest={'rule':'freestyle','seed':SEED,'sources':sources,'statistics':dict(stats),'split_policy':'D4 full-game dedup across both years; shared D4 first-three-ply opening families in 80/10/10 groups; first 8 plies excluded as labels; D4 exact side-to-move positions deduplicated across and within all splits. Three-ply families cover the shorter 2026 preset openings too.','value_policy':'Only geometric five-or-longer finishes or full-board draws. No guessed resignation/time-loss result colors.','samples':{},'splits':{},'terms':'Private local research; no raw games or derived weights in public assets or source archive.'}
    earlier=set()
    for split,maximum in [('train',30000),('validation',1024),('test',2048)]:
        items=[];rng=random.Random(f'{SEED}:{split}')
        for record in splits[split]:
            for side in (0,1):
                eligible=list(range(8+side,len(record['moves']),2))
                indices=random.Random(f'{SEED}:{record["id"]}:{side}').sample(eligible,min(2,len(eligible)))
                items.extend((record,ply) for ply in indices)
        rng.shuffle(items)
        boards=[];lines=[];masks=[];targets=[];values=[];families=[];ids=[];openings=[]
        cross=within=0;current=set()
        for record,ply in items:
            symmetry=rng.randrange(8)
            prefix=[transform(p,symmetry) for p in record['moves'][:ply]]
            target=transform(record['moves'][ply],symmetry);color=1+ply%2
            board=np.zeros((2,15,15),dtype=np.int8)
            for i,p in enumerate(prefix):board[0 if 1+i%2==color else 1,p//15,p%15]=1
            key=position_key(board)
            if key in earlier:cross+=1;continue
            if key in current:within+=1;continue
            current.add(key)
            line=np.empty((4,15,15),dtype=np.int32)
            transform_board_to_line_encoding(board,line,11,raw_code=False)
            legal=(board.sum(axis=0).reshape(-1)==0).astype(np.uint8)
            if not legal[target]:raise ValueError('Occupied target')
            boards.append(board);lines.append(line);masks.append(np.packbits(legal,bitorder='little'))
            targets.append(target);values.append(2 if not record['winner'] else 0 if record['winner']==color else 1)
            families.append(record['family']);ids.append(record['id'])
            if len(boards)>=maximum:break
        earlier|=current
        if not boards:raise ValueError('Empty split')
        path=OUT/f'{split}-mixed.npz'
        np.savez_compressed(path,board=np.asarray(boards),line=np.asarray(lines),legal=np.asarray(masks),policy=np.asarray(targets,dtype=np.int64),value=np.asarray(values,dtype=np.int64),family=np.asarray(families),game_id=np.asarray(ids),source=np.asarray(['gomocup']*len(boards)))
        manifest['samples'][f'{split}-mixed']={'positions':len(boards),'families':len(set(families)),'sha256':sha(path),'removed_cross_split':cross,'removed_within_split':within}
        manifest['splits'][split]={'games':len(splits[split]),'families':len(set(r['family'] for r in splits[split]))}
        # Complete held-out game records are retained to derive independent match openings.
        (OUT/f'{split}-games.json').write_text(json.dumps(splits[split],separators=(',',':')))
        print(split,manifest['samples'][f'{split}-mixed'],flush=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (OUT/'rejected.json').write_text(json.dumps(rejected,indent=2)+'\n')
    print(json.dumps(manifest,indent=2),flush=True)

if __name__=='__main__':main()
