#!/usr/bin/env python3
"""Compare PyTorch WDL with the exported model as loaded by native C++ Rapfi."""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('scratch',ROOT/'scripts/train-nnue-scratch.py')
scratch=importlib.util.module_from_spec(spec);spec.loader.exec_module(scratch)
import numpy as np
import torch
from accelerate import PartialState
from model import build_model
from line_encoding_cpp import transform_board_to_line_encoding

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--checkpoint',required=True);parser.add_argument('--network',required=True);parser.add_argument('--color',choices=['black','white'],default='black');parser.add_argument('--output',required=True)
    parser.add_argument('--rule',choices=['renju','freestyle'],default='renju');parser.add_argument('--check-policy',action='store_true')
    args=parser.parse_args();network=(ROOT/args.network).resolve();checkpoint=(ROOT/args.checkpoint).resolve();output=(ROOT/args.output).resolve()
    PartialState(cpu=True);torch.set_num_threads(1)
    state=torch.load(checkpoint,weights_only=True)
    model=build_model('mix9svq',**scratch.MODEL_ARGS);model.load_state_dict(state['model']);model.eval()
    config=(ROOT/'models/rapfi/config.toml').read_text()
    start=config.index('[[model.evaluator.weights]]');end=config.index('[search]',start)
    config=config[:start]+f'[[model.evaluator.weights]]\nweight_file_black = "{network}"\nweight_file_white = "{network}"\n\n'+config[end:]
    config=config.replace('binary_file = "classical.bin"',f'binary_file = "{ROOT/"models/rapfi/classical.bin"}"')
    config_path=output.with_suffix('.toml');config_path.parent.mkdir(parents=True,exist_ok=True);config_path.write_text(config)
    fixtures=[[112,98,113,97],[112,98,113,97,128,96,110,126],[0,112,14,113,210,98,224,97]]
    results=[]
    for moves in fixtures:
        if args.color=='white':moves=moves+[82 if len(moves)==8 and moves[0]==112 else 30]
        color=1+len(moves)%2
        board=np.zeros((2,15,15),dtype=np.int8)
        for ply,point in enumerate(moves):board[0 if 1+ply%2==color else 1,point//15,point%15]=1
        line=np.empty((4,15,15),dtype=np.int32);transform_board_to_line_encoding(board,line,11,raw_code=False)
        inputs={'board_input':torch.tensor(board[None],dtype=torch.float32),'line_encoding':torch.tensor(line[None]),'stm_input':torch.tensor([[-1. if color==1 else 1.]])}
        with torch.no_grad():
            predicted=model(inputs)
            prob=predicted[0].softmax(1)[0].numpy()
            empty=board.sum(axis=0).reshape(-1)==0
            torch_policy=predicted[1].flatten()[torch.from_numpy(empty)].softmax(0).numpy()
        if color==2:prob=prob[[1,0,2]]
        command=f'START 15\nINFO RULE {4 if args.rule=="renju" else 0}\nYXBOARD\n'+'\n'.join(f'{p%15},{p//15},{1 if 1+i%2==color else 2}' for i,p in enumerate(moves))+'\nDONE\n'+('NNPOLICY\n' if args.check_policy else '')+'TRACESEARCH\nEND\n'
        process=subprocess.run([str(ROOT/'.build/native/bin/pbrain-rapfi'),'--config',str(config_path)],input=command,text=True,capture_output=True,timeout=30,check=True,cwd=ROOT)
        match=re.search(r'Evaluator Eval\[Black\]:.*WR:\s*([\d.eE+-]+)\s+LR:\s*([\d.eE+-]+)\s+DR:\s*([\d.eE+-]+)',process.stdout)
        if not match:raise RuntimeError('C++ failed to evaluate exported NNUE: '+process.stdout[-2000:])
        native=np.array([float(value) for value in match.groups()]);delta=float(np.max(np.abs(native-prob)))
        results.append({'moves':moves,'torch_black_wld':prob.tolist(),'cpp_black_wld':native.tolist(),'max_absolute_difference':delta})
        if delta>.002:raise RuntimeError(f'PyTorch/C++ WDL mismatch {delta}: {results[-1]}')
        if args.check_policy:
            logits={int(point):float(value) for point,value in re.findall(r'^MESSAGE NNPOLICY (\d+) (\S+)$',process.stdout,re.M)}
            indices=np.flatnonzero(empty)
            if set(logits)!=set(indices):raise ValueError('Incomplete native policy output')
            native_logits=np.array([logits[int(i)] for i in indices])
            native_policy=np.exp(native_logits-native_logits.max());native_policy/=native_policy.sum()
            difference=float(np.max(np.abs(native_policy-torch_policy)))
            results[-1].update({'policy_max_absolute_difference':difference,'torch_policy_top1':int(indices[torch_policy.argmax()]),'cpp_policy_top1':int(indices[native_policy.argmax()])})
            if difference>.002:raise RuntimeError(f'PyTorch/C++ policy mismatch {difference}: {results[-1]}')
    output.write_text(json.dumps({'network_sha256':hashlib.sha256(network.read_bytes()).hexdigest(),'checkpoint_sha256':hashlib.sha256(checkpoint.read_bytes()).hexdigest(),'tolerance':.002,'tests':results},indent=2)+'\n')
    print(json.dumps({'passed':len(results),'max_difference':max(r['max_absolute_difference'] for r in results)}))
if __name__=='__main__':main()
