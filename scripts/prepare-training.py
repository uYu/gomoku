#!/usr/bin/env python3
"""Validate public WinePy games and create game-disjoint Rapfi .bin corpora."""
import argparse
import ctypes
import platform
import hashlib
import json
import random
import struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/winepy-games.json'
OUT = ROOT / '.build/training'
SEED = 20261029

def winner(board, move, rule="freestyle"):
    row, col = divmod(move, 15)
    for dr, dc in [(0, 1), (1, 0), (1, 1), (1, -1)]:
        length = 1
        for sign in [-1, 1]:
            r, c = row + sign * dr, col + sign * dc
            while 0 <= r < 15 and 0 <= c < 15 and board[r * 15 + c] == board[move]:
                length += 1
                r += sign * dr
                c += sign * dc
        if (length == 5 if rule == "renju" and board[move] == 1 else length >= 5):
            return board[move]
    return 0

def transform(move, symmetry):
    r, c = divmod(move, 15)
    if symmetry >= 4:
        c = 14 - c
    for _ in range(symmetry % 4):
        r, c = c, 14 - r
    return r * 15 + c

def identity(moves):
    return min(bytes(transform(m, s) for m in moves) for s in range(8))

def validate(game, rule="freestyle", checker=None):
    board = [0] * 225
    moves = []
    won = 0
    for ply, encoded in enumerate(game):
        if type(encoded) is not int or abs(encoded) >= 225:
            raise ValueError('coordinate')
        color = 1 if ply % 2 == 0 else 2
        if encoded and (encoded > 0) != (color == 1):
            raise ValueError('turn')
        move = abs(encoded)
        if board[move]:
            raise ValueError('duplicate move')
        if won:
            raise ValueError('moves after win')
        if rule == "renju" and color == 1 and checker and checker(board, move) > 0:
            raise ValueError("black forbidden move")
        board[move] = color
        moves.append(move)
        won = winner(board, move, rule)
    if not won and len(moves) != 225:
        raise ValueError('unfinished game')
    return moves, won

def encode(move):
    row, col = divmod(move, 15)
    return (col << 5) | row

def write_entries(path, games, rule="freestyle"):
    count = 0
    with path.open('wb') as stream:
        for moves, won in games:
            for ply, move in enumerate(moves):
                if ply < 4:
                    continue
                color = 1 if ply % 2 == 0 else 2
                result = 1 if won == 0 else 2 if won == color else 0
                # Rapfi BinEntryHead: result:2, ply:9, boardsize:5; rule:3, move:13.
                stream.write(struct.pack('<HH', result | ply << 2 | 15 << 11, (encode(move) << 3) | (4 if rule == "renju" else 0)))
                stream.write(struct.pack('<' + 'H' * ply, *(encode(m) for m in moves[:ply])))
                count += 1
    return count

def renju_checker():
    suffix = '.dylib' if platform.system() == 'Darwin' else '.so'
    library = ctypes.CDLL(str(ROOT / ('.build/native/libgomoku_rules' + suffix)))
    library.gm_rules_input.restype = ctypes.POINTER(ctypes.c_int)
    cells = library.gm_rules_input()
    def check(board, move):
        for i, cell in enumerate(board): cells[i] = cell
        value = library.gm_rule_forbidden(move)
        if value < 0: raise ValueError('native rule checker failed')
        return value
    return check

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rule', choices=['freestyle','renju'], default='freestyle')
    options = parser.parse_args()
    rule = options.rule
    output = OUT / 'renju' if rule == 'renju' else OUT
    checker = renju_checker() if rule == 'renju' else None
    raw = json.loads(RAW.read_text())
    accepted = []
    seen = set()
    rejected = Counter()
    for game in raw:
        try:
            moves, won = validate(game, rule, checker)
            key = identity(moves)
            if key in seen:
                rejected['D4-duplicate game'] += 1
                continue
            seen.add(key)
            accepted.append((moves, won))
        except ValueError as error:
            rejected[str(error)] += 1
    random.Random(SEED).shuffle(accepted)
    n = len(accepted)
    splits = {'train': accepted[:int(n * .8)], 'validation': accepted[int(n * .8):int(n * .9)], 'test': accepted[int(n * .9):]}
    output.mkdir(parents=True, exist_ok=True)
    report = {'source': 'https://huggingface.co/datasets/Karesis/Gomoku', 'revision': '5cf594efdcddcba688965e3bdcab37f2a89d714b', 'license': 'MIT (publisher dataset card)', 'raw_sha256': hashlib.sha256(RAW.read_bytes()).hexdigest(), 'seed': SEED, 'input_games': len(raw), 'accepted_games': n, 'rejected': dict(rejected), 'minimum_ply': 4, 'rule': rule, 'source_rule': 'freestyle; for renju, only full games legal under the C++ forbidden-move checker are retained', 'deduplication': 'full game under all eight D4 symmetries; split only after deduplication', 'splits': {}}
    for name, games in splits.items():
        path = output / (name + '.bin')
        positions = write_entries(path, games, rule)
        report['splits'][name] = {'games': len(games), 'positions': positions, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        (output / (name + '-games.json')).write_text(json.dumps([m for m, _ in games]))
    (output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
