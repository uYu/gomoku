import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NativeRapfi, ROOT } from './native-client.ts';
import { loadNodeRules } from './rules-client.ts';
import { replay } from '../src/game/engine.ts';
const output = resolve(ROOT, process.argv[2] ?? '.build/experiments/mix9svq-scratch-r15-v2/openings.json');
await loadNodeRules();
const source = readFileSync(resolve(ROOT, '.build/training/renjunet/test.jsonl'), 'utf8').trim().split('\n');
const candidates = source.map(line => JSON.parse(line)).filter(record => record.tournament.rated === '1');
const client = new NativeRapfi();
const seen = new Set<string>();
const openings: { moves: number[]; family: string; gameId: string; referenceScore: number }[] = [];
try {
  for (const candidate of candidates) {
    if (seen.has(candidate.family)) continue;
    seen.add(candidate.family);
    const moves = candidate.moves.slice(0,6), position = replay(moves,'renju').at(-1)!;
    await client.reset();
    const result = await client.analyze({position,moves,rule:'renju',difficulty:'hard',timeMs:80,maxNodes:8000});
    if (Math.abs(result.score)>200) continue;
    openings.push({moves,family:candidate.family,gameId:candidate.sources[0].id,referenceScore:result.score});
    if (openings.length===8) break;
  }
  if (openings.length<8) throw new Error('Insufficient held-out balanced openings');
  mkdirSync(resolve(output,'..'),{recursive:true});
  writeFileSync(output,JSON.stringify({rule:'renju',source:'RenjuNet test split; D4 six-ply opening families excluded from training',selection:'First eight distinct rated test families with official NNUE abs(score)<=200 at 80ms / <=8000 nodes; no candidate weights used. Approximate balance, not theoretical proof.',openings},null,2)+'\n');
} finally { await client.close(); }
