#!/usr/bin/env python3
"""Audit official, locally downloaded tournament archives without publishing games.

Scores in PSQ tails and PGN are retained as unverified metadata. Only a legal
on-board finish is assigned a color outcome here. Resignation/time loss needs
an independently checked mapping before value training.
"""
import hashlib
import importlib.util
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'scripts/prepare-training.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

def parse_psq(text):
    lines = text.splitlines()
    if not lines or not lines[0].startswith('Piskvorky 15x15,'):
        raise ValueError('unsupported board/header')
    moves = []
    at = 1
    while at < len(lines) and re.fullmatch(r'\d+,\d+,\d+', lines[at]):
        x,y,_ = map(int, lines[at].split(','))
        if not (1 <= x <= 15 and 1 <= y <= 15): raise ValueError('coordinate')
        moves.append((y-1)*15+x-1)
        at += 1
    if len(lines[at:]) != 4 or not re.fullmatch(r'[012],Renju', lines[-1]):
        raise ValueError('unrecognized PSQ tail')
    return moves, {'players_in_file_order':lines[at:at+2], 'declared_result_code':int(lines[-1][0])}

def audit(year, checker):
    path = ROOT / f'.build/datasets/gomocup{year}results.zip'
    stats, endings = Counter(), Counter()
    seen, openings = set(), set()
    positions = 0
    examples, records = {}, []
    with zipfile.ZipFile(path) as archive:
        names = [n for n in archive.namelist() if n.startswith('Renju/') and n.lower().endswith('.psq')]
        for name in names:
            stats['input_games'] += 1
            try:
                moves, metadata = parse_psq(archive.read(name).decode('utf-8-sig'))
                board = [0]*225
                won = 0
                for ply,move in enumerate(moves):
                    if board[move]: raise ValueError('duplicate square')
                    if won: raise ValueError('moves after geometric win')
                    color = 1 + ply % 2
                    if color == 1 and checker(board,move): raise ValueError('black forbidden move')
                    board[move] = color
                    won = prepare.winner(board,move,'renju')
                endings['black five' if won == 1 else 'white five/overline' if won == 2 else 'no geometric finish; result needs metadata'] += 1
                key = prepare.identity(moves)
                if key in seen: stats['D4_duplicate_games'] += 1
                else: seen.add(key)
                openings.add(prepare.identity(moves[:6]))
                positions += max(0,len(moves)-6)
                stats['legal_games'] += 1
                records.append({'archive_member':name,'moves':moves,'geometric_winner':won,**metadata})
            except ValueError as error:
                stats[str(error)] += 1
                examples.setdefault(str(error),name)
    output = path.with_name(f'gomocup{year}-quality.json')
    report = {'year':year,'source':f'https://gomocup.org/results/gomocup-result-{year}/','archive_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'statistics':dict(stats),'legal_game_endings':dict(endings),'unique_D4_games':len(seen),'unique_D4_first_six_move_groups':len(openings),'positions_after_first_six_plies':positions,'rejection_examples':examples,'result_policy':'Raw result codes are not mapped to colors. Only legal on-board terminal lines are assigned color outcomes.','split_policy':'Hold out complete D4 opening families, preferably whole years; random game splits can leak paired tournament openings.','use':'Local personal research; public availability does not establish an open redistribution license.'}
    output.write_text(json.dumps(report,indent=2)+'\n')
    path.with_name(f'gomocup{year}-legal-private.json').write_text(json.dumps(records,separators=(',',':')))
    print(json.dumps(report,indent=2))
if __name__ == '__main__':
    checker = prepare.renju_checker()
    for year in (2025,2026): audit(year,checker)
