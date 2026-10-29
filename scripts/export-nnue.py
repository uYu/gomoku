#!/usr/bin/env python3
"""Export a locally created scratch checkpoint with the official serializer."""
import argparse
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('scratch',ROOT/'scripts/train-nnue-scratch.py')
scratch=importlib.util.module_from_spec(spec);spec.loader.exec_module(scratch)
import torch
from accelerate import PartialState
from model import build_model
from export import export_serialization
from nnue_export import install as install_serializer
install_serializer()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--checkpoint',required=True);parser.add_argument('--output',required=True);parser.add_argument('--threads',type=int,default=1);parser.add_argument('--preflight-sparse',action='store_true')
    args=parser.parse_args();checkpoint=(ROOT/args.checkpoint).resolve();output=(ROOT/args.output).resolve()
    if not checkpoint.is_relative_to(ROOT/'.build') or not output.is_relative_to(ROOT/'.build'):raise ValueError('Local research paths required')
    PartialState(cpu=True);torch.set_num_threads(args.threads)
    state=torch.load(checkpoint,weights_only=True)
    if 'random' not in state.get('initialization',''):raise ValueError('Expected a local random-initialized checkpoint')
    model=build_model('mix9svq',**scratch.MODEL_ARGS);model.load_state_dict(state['model']);model.eval()
    if args.preflight_sparse:
        # Test-only format check. This file is never a gameplay candidate.
        import numpy as np
        from line_encoding_cpp import transform_board_to_line_encoding
        from model.serialization.mixnet import Mix9svqNetSerializer
        fixtures=[[112,98,113,97],[112,98,113,97,128,96,110,126],[0,112,14,113,210,98,224,97]]
        boards=[];lines=[]
        for color_name in ['black','white']:
            for original in fixtures:
                moves=list(original)
                if color_name=='white':moves+=[82 if len(moves)==8 and moves[0]==112 else 30]
                side=1+len(moves)%2;board=np.zeros((2,15,15),dtype=np.int8)
                for ply,point in enumerate(moves):board[0 if 1+ply%2==side else 1,point//15,point%15]=1
                line=np.empty((4,15,15),dtype=np.int32);transform_board_to_line_encoding(board,line,11,raw_code=False)
                boards.append(board);lines.append(line)
        inputs=torch.tensor(np.stack(boards),dtype=torch.float32)
        encodings=np.stack(lines)
        def sparse_features(serializer,network,device,mapping_idx):
            directions=[0,1] if mapping_idx==1 else [2,3]
            feature=getattr(network,f'mapping{mapping_idx}')(inputs,dirs=directions).clamp(-511/32,511/32)
            feature=feature.permute(0,1,3,4,2).reshape(-1,64)
            codes=encodings[:,directions].reshape(-1)
            unique,first=np.unique(codes,return_index=True)
            layer=network.vq_layers[mapping_idx-1]
            _,info,_=layer(feature[torch.tensor(first)])
            index=np.zeros((442503,1),dtype=np.uint16);index[unique]=info['embed_indices'].cpu().numpy()
            book=np.rint(np.clip(layer.codebook.cpu().numpy(),-16,511/32)*32).astype(np.int16)
            return book,index
        Mix9svqNetSerializer._export_feature_codebook=sparse_features
    output.parent.mkdir(parents=True,exist_ok=True)
    with torch.no_grad():export_serialization(str(output),'lz4','mix9svq',model,{'rules':['renju'],'boardsizes':[15]},True)
if __name__=='__main__':main()
