#!/usr/bin/env python3
"""Inventory the official RenjuNet download for local, offline research only.

Does not publish, transform or assume legal replay of the complete database.
Opening protocols differ; training preparation must validate moves separately.
"""
import gzip
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
path = ROOT / '.build/datasets/renjunet.xml.gz'
compressed = path.read_bytes()
raw = gzip.decompress(compressed)
root = ET.fromstring(raw)
rules = {r.get('id'):r.attrib for r in root.find('rules')}
counts = Counter(g.get('rule') for g in root.find('games'))
categories = Counter()
nonempty_categories = Counter()
malformed = empty = 0
for game in root.find('games'):
    categories[rules.get(game.get('rule'),{}).get('category','unknown')] += 1
    moves = (game.findtext('move') or '').split()
    if not moves: empty += 1
    else: nonempty_categories[rules.get(game.get("rule"),{}).get("category","unknown")] += 1
    if any(not re.fullmatch(r'[a-o](?:[1-9]|1[0-5])',m) for m in moves): malformed += 1
report = {'source':'https://www.renju.net/game/', 'download':'https://www.renju.net/game/download/', 'database_date':root.get('date'), 'archive_sha256':hashlib.sha256(compressed).hexdigest(), 'archive_bytes':len(compressed),'uncompressed_bytes':len(raw),'games':len(root.find('games')),'categories':dict(categories),'nonempty_categories':dict(nonempty_categories), 'rule_counts':{rules[k]['name']:v for k,v in counts.items()},'empty_records':empty,'records_with_unrecognized_coordinate_token':malformed,'validation':'Inventory and coordinate syntax only; not a full legality, duplication, opening-protocol or result audit. Category 1 contains Renju variants, category 2 Gomoku.','terms':'Personal non-commercial OFFLINE databases only; contents and modifications must not be used in websites/online systems. Raw file remains in ignored .build/datasets and is excluded from all public assets/source archives.'}
path.with_name('renjunet-inventory.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
