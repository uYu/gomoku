#!/usr/bin/env python3
"""Clean official RenjuNet records into local, opening-disjoint Renju corpora.

Raw/derived databases stay in ignored .build for personal offline research.
Results remain human tournament outcomes, not engine-evaluated value targets.
"""
import argparse
import ctypes
import gzip
import hashlib
import json
import platform
import random
import re
import struct
import time
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.renju.net/game/download/'
SEED = 20261029
EXCLUDED_RULES = {'9', '23', '27'}  # experimental / indulgence / swap-5 free
TOKEN = re.compile(r'([a-o])([1-9]|1[0-5])')

class NativeDataset:
    def __init__(self):
        suffix = '.dylib' if platform.system() == 'Darwin' else '.so'
        self.library = ctypes.CDLL(str(ROOT / ('.build/native/libgomoku_dataset' + suffix)))
        ints = ctypes.POINTER(ctypes.c_int)
        self.library.gm_dataset_validate.argtypes = [ints,ctypes.c_int,ints]
        self.library.gm_dataset_keys.argtypes = [ints,ctypes.c_int,ctypes.c_int,ctypes.POINTER(ctypes.c_uint8)]
        self.library.gm_dataset_legal_mask.argtypes = [ints,ctypes.c_int,ctypes.POINTER(ctypes.c_uint8)]
        self.mask = (ctypes.c_uint8 * 225)()
        self.moves = (ctypes.c_int * 225)()
        self.detail = (ctypes.c_int * 2)()
        self.keys = (ctypes.c_uint8 * 450)()
    def validate(self, moves):
        if len(moves) > 225: return 4, -1, 0
        self.moves[:len(moves)] = moves
        status = self.library.gm_dataset_validate(self.moves,len(moves),self.detail)
        if status == 5: raise RuntimeError('Native validator failed')
        return status,self.detail[0],self.detail[1]
    def legal_mask(self, moves):
        if len(moves)>225: raise ValueError('Invalid prefix length')
        self.moves[:len(moves)] = moves
        if self.library.gm_dataset_legal_mask(self.moves,len(moves),self.mask):
            raise ValueError('Illegal or terminal prefix')
        return bytes(self.mask)
    def identity(self, moves, opening_plies=6):
        if not 0 <= opening_plies <= len(moves) <= 225: raise ValueError('Invalid key length')
        self.moves[:len(moves)] = moves
        if self.library.gm_dataset_keys(self.moves,len(moves),opening_plies,self.keys):
            raise RuntimeError('Canonical key generation failed')
        data = bytes(self.keys)
        return data[:len(moves)],data[225:450]

def parse_moves(text):
    moves = []
    for token in text.split():
        match = TOKEN.fullmatch(token)
        if not match: raise ValueError('invalid_coordinate')
        col,row = ord(match[1])-97,15-int(match[2])
        moves.append(row*15+col)
    return moves

def clean_game(game, rules, native, minimum_plies=12, opening_plies=6):
    rule = rules.get(game.get('rule'))
    if not rule or rule.get('category') != '1': raise ValueError('not_renju')
    if game.get('rule') in EXCLUDED_RULES: raise ValueError('nonstandard_rule')
    text = game.findtext('move') or ''
    if not text.strip(): raise ValueError('empty_moves')
    moves = parse_moves(text)
    if len(moves) < minimum_plies: raise ValueError('short_record')
    result = game.get('bresult')
    if result not in {'0','0.5','1'}: raise ValueError('unknown_result')
    won = {'0':2,'0.5':0,'1':1}[result]
    status,ply,geometric = native.validate(moves)
    finish = 'geometric_win' if geometric else 'recorded_result_without_geometric_win'
    if status:
        # A recorded terminal black foul loses. Keep its legal prefix only:
        # never supervise a forbidden move as a policy target.
        if status == 3 and ply == len(moves)-1 and won == 2:
            moves = moves[:-1]
            if len(moves) < minimum_plies: raise ValueError('short_after_terminal_foul')
            finish = 'terminal_black_foul_removed'
        else:
            reason = {1:'duplicate_square',2:'moves_after_win',3:'black_forbidden_move',4:'invalid_move_count_or_coordinate'}[status]
            raise ValueError(f'{reason}@{ply}')
    if geometric and geometric != won: raise ValueError('result_conflicts_with_board_win')
    key,family = native.identity(moves,opening_plies)
    return moves,won,finish,key,family

def split_families(records, seed=SEED):
    groups = defaultdict(list)
    for record in records: groups[record['family']].append(record)
    ordered = list(groups.items())
    random.Random(seed).shuffle(ordered)
    ordered.sort(key=lambda pair:len(pair[1]),reverse=True)
    target = {'train':len(records)*.8,'validation':len(records)*.1,'test':len(records)*.1}
    splits = {name:[] for name in target}
    for _,group in ordered:
        name = max(target,key=lambda key:target[key]-len(splits[key]))
        splits[name].extend(group)
    for name,items in splits.items(): random.Random(seed+len(name)).shuffle(items)
    return splits

def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def write_binary(path, records, minimum_ply=8):
    count = 0
    with path.open('wb') as stream:
        for record in records:
            prefix = bytearray()
            won = record['winner']
            for ply,move in enumerate(record['moves']):
                row,col = divmod(move,15)
                encoded = (col<<5)|row
                if ply >= minimum_ply:
                    color = 1+ply%2
                    result = 1 if won == 0 else 2 if won == color else 0
                    stream.write(struct.pack('<HH',result | ply<<2 | 15<<11,(encoded<<3)|4))
                    stream.write(prefix)
                    count += 1
                prefix.extend(struct.pack('<H',encoded))
    return count

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input',default='.build/datasets/renjunet.xml.gz')
    parser.add_argument('--output',default='.build/training/renjunet')
    parser.add_argument('--opening-plies',type=int,default=6)
    parser.add_argument('--minimum-plies',type=int,default=12)
    options = parser.parse_args()
    if not 1 <= options.opening_plies <= 8 or options.minimum_plies < 9:
        parser.error('Use 1..8 opening plies and at least 9 game plies')
    source,output = ROOT/options.input,(ROOT/options.output).resolve()
    if not output.is_relative_to(ROOT/'.build'): parser.error('Research databases must remain under .build')
    output.mkdir(parents=True,exist_ok=True)
    native = NativeDataset()
    raw = gzip.decompress(source.read_bytes())
    root = ET.fromstring(raw)
    rules = {r.get('id'):r.attrib for r in root.find('rules')}
    tournaments = {t.get('id'):t.attrib for t in root.find('tournaments')}
    records,stats = {},Counter()
    start = time.monotonic()
    with (output/'rejected.jsonl').open('w') as rejected, (output/'duplicates.jsonl').open('w') as duplicates:
        for game in root.find('games'):
            stats['source_records'] += 1
            try:
                moves,won,finish,key,family = clean_game(game,rules,native,options.minimum_plies,options.opening_plies)
                metadata = dict(game.attrib)
                stats['validated_source_records'] += 1
                if key in records:
                    existing = records[key]
                    existing['outcomes'].add(won)
                    existing['sources'].append(metadata)
                    duplicates.write(json.dumps({'game_id':game.get('id'),'duplicate_of':existing['sources'][0]['id']})+'\n')
                    stats['D4_duplicate_records'] += 1
                else:
                    records[key] = {'moves':moves,'winner':won,'finish':finish,'family':hashlib.sha256(family).hexdigest(),'outcomes':{won},'sources':[metadata]}
            except ValueError as error:
                reason = str(error)
                stats['rejected_'+reason.split('@')[0]] += 1
                rejected.write(json.dumps({'game_id':game.get('id'),'rule_id':game.get('rule'),'reason':reason})+'\n')
            if stats['source_records']%10000 == 0:
                print(f"validated {stats['source_records']} source records; {len(records)} unique candidates; {time.monotonic()-start:.1f}s",flush=True)
        accepted = []
        for key,record in records.items():
            if len(record.pop('outcomes')) != 1:
                stats['conflicting_duplicate_groups'] += 1
                for metadata in record['sources']:
                    stats['rejected_conflicting_duplicate_result'] += 1
                    rejected.write(json.dumps({'game_id':metadata['id'],'reason':'conflicting_duplicate_result'})+'\n')
                continue
            record['game_key'] = hashlib.sha256(key).hexdigest()
            record['tournament'] = tournaments.get(record['sources'][0].get('tournament'),{})
            record['rule'] = rules[record['sources'][0]['rule']]
            accepted.append(record)
    splits = split_families(accepted)
    report = {'source':SOURCE,'source_page':'https://www.renju.net/game/','database_date':root.get('date'),'source_sha256':digest(source),'seed':SEED,'rule':'renju','statistics':dict(stats),'accepted_unique_games':len(accepted),'finish_counts':dict(Counter(r['finish'] for r in accepted)),'opening_plies':options.opening_plies,'minimum_policy_ply':8,'minimum_game_plies':options.minimum_plies,'splitting':'D4 canonical colored opening positions are grouped before a seeded size-balanced 80/10/10 split. Identical full games are D4-deduplicated, conflicting outcomes quarantined.','limitations':['Human recorded outcomes, including resignation/adjudication/draw; not strong-engine relabels.','Opening-family-disjoint, not a claim that all later transposed positions are disjoint.','No player-strength threshold: raw publisher/player/event IDs retained for filtering.'],'terms':'Personal non-commercial OFFLINE databases only; no database contents or modifications in websites/online systems. Outputs remain local and are not used for distributed models.','excluded_rule_ids':sorted(EXCLUDED_RULES),'splits':{}}
    for name,items in splits.items():
        path = output/(name+'.jsonl')
        with path.open('w') as stream:
            for record in items: stream.write(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
        (output/(name+'-games.json')).write_text(json.dumps([r['moves'] for r in items],separators=(',',':')))
        positions = write_binary(output/(name+'.bin'),items)
        report['splits'][name] = {'games':len(items),'opening_families':len({r['family'] for r in items}),'positions':positions,'binary_bytes':(output/(name+'.bin')).stat().st_size,'binary_sha256':digest(output/(name+'.bin')),'records_sha256':digest(path)}
        print(f"wrote {name}: {len(items)} games, {positions} positions",flush=True)
    (output/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2),flush=True)
if __name__ == '__main__': main()
